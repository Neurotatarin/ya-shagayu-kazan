package ru.yashagayu.kazan.demo;

import android.app.PendingIntent;
import android.content.*;
import android.net.Uri;
import android.os.*;
import androidx.annotation.Nullable;
import androidx.media3.common.*;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.*;
import com.getcapacitor.JSObject;
import java.io.File;
import java.net.URI;
import java.util.*;

/** Owns both players outside the WebView lifecycle. Media3 owns the foreground notification. */
public final class KazanPlaybackService extends MediaSessionService {
    static final String BIND="ru.yashagayu.kazan.BIND";
    final class LocalBinder extends Binder { KazanPlaybackService service(){return KazanPlaybackService.this;} }
    private final LocalBinder binder=new LocalBinder();
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final Set<Runnable> observers=new HashSet<>();
    private ExoPlayer voice,music;
    private MediaSession session;
    private KazanOfflineStore offline;
    private String id="",url="",title="",artist="",album="",error="",musicURL="",musicError="";
    private boolean backgroundEnabled=false,local=false;
    private double fallbackDuration=0;
    private float musicVolume=.08f;
    private long lastSaved=0;
    private final Runnable ticker=new Runnable(){@Override public void run(){emit();handler.postDelayed(this,500);}};
    @Override public void onCreate(){
        super.onCreate();
        try{offline=new KazanOfflineStore(this);}catch(Exception ignored){}
        voice=new ExoPlayer.Builder(this).build();
        voice.setWakeMode(C.WAKE_MODE_LOCAL);
        voice.setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_SPEECH).build(),true);
        voice.setHandleAudioBecomingNoisy(true);
        music=new ExoPlayer.Builder(this).build();music.setRepeatMode(Player.REPEAT_MODE_ONE);music.setVolume(musicVolume);
        music.setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),false);
        voice.addListener(new Player.Listener(){
            @Override public void onEvents(Player player,Player.Events events){followVoice();emit();}
            @Override public void onPlayerError(PlaybackException failure){error="AUDIO_PLAY_FAILED";followVoice();emit();}
        });
        music.addListener(new Player.Listener(){
            @Override public void onPlayerError(PlaybackException failure){musicError="AUDIO_BACKGROUND_FAILED";backgroundEnabled=false;music.pause();emit();}
        });
        Intent open=new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);
        session=new MediaSession.Builder(this,voice).setSessionActivity(PendingIntent.getActivity(this,0,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE)).build();
        // This bridge binds locally rather than through MediaController. Add
        // the session explicitly so Media3 owns notification/FGS transitions.
        addSession(session);
        restore();handler.post(ticker);
    }
    @Override @Nullable public IBinder onBind(Intent intent){IBinder framework=super.onBind(intent);return BIND.equals(intent.getAction())?binder:framework;}
    @Override @Nullable public MediaSession onGetSession(MediaSession.ControllerInfo controller){return controller.getUid()==android.os.Process.myUid()||controller.isTrusted()?session:null;}
    void observe(Runnable observer){observers.add(observer);}
    void unobserve(Runnable observer){observers.remove(observer);}
    // Player commands are asynchronous. Resolve bridge promises after the
    // playback thread has processed them and its position update reached main.
    void afterCommands(Runnable completion){voice.createMessage((type,payload)->handler.post(completion)).send();}
    private void emit(){
        if(voice==null)return;
        long now=SystemClock.elapsedRealtime();if(now-lastSaved>3000){persist();lastSaved=now;}
        for(Runnable observer:new ArrayList<>(observers))observer.run();
    }
    private void followVoice(){
        boolean play=backgroundEnabled&&voice.isPlaying()&&musicError.isEmpty()&&music.getMediaItemCount()>0;
        music.setPlayWhenReady(play);
    }
    static boolean allowedAudio(String raw){
        try{URI uri=KazanOfflineStore.allowed(raw).toURI();return "kazan-demo.38-180-191-162.sslip.io".equals(uri.getHost())&&(uri.getPath().endsWith(".mp3")||uri.getPath().endsWith(".m4a"));}catch(Exception e){return false;}
    }
    private Uri mediaUri(String raw) throws Exception {
        File file=offline==null?null:offline.localAudio(raw);if(file!=null)return Uri.fromFile(file);
        if(!allowedAudio(raw))throw new Exception("AUDIO_URL_REJECTED");return Uri.parse(raw);
    }
    void load(String track,String raw,String name,String by,String collection,double position,double duration,float speed)throws Exception{
        if(!allowedAudio(raw)&&!(offline!=null&&offline.localAudio(raw)!=null))throw new Exception("AUDIO_URL_REJECTED");
        Uri uri=mediaUri(raw);voice.pause();id=track;url=raw;title=name;artist=by;album=collection;fallbackDuration=Math.max(0,duration);local="file".equals(uri.getScheme());error="";
        MediaMetadata metadata=new MediaMetadata.Builder().setTitle(title).setArtist(artist).setAlbumTitle(album).setIsPlayable(true).build();
        voice.setMediaItem(new MediaItem.Builder().setMediaId(track).setUri(uri).setMediaMetadata(metadata).build(),Math.max(0,(long)(position*1000)));
        voice.setPlaybackSpeed(Math.max(.5f,Math.min(2f,speed)));voice.prepare();followVoice();persist();emit();
    }
    void play(){
        if(voice.getMediaItemCount()==0)return;
        error="";
        if(voice.getPlaybackState()==Player.STATE_ENDED)voice.seekTo(0);
        if(voice.getPlaybackState()==Player.STATE_IDLE)voice.prepare();
        voice.play();emit();
    }
    void pause(){voice.pause();followVoice();persist();emit();}
    void seek(double seconds){long duration=voice.getDuration();voice.seekTo(Math.max(0,Math.min((long)(seconds*1000),duration>0?duration:Long.MAX_VALUE)));persist();emit();}
    void speed(float value){voice.setPlaybackSpeed(Math.max(.5f,Math.min(2f,value)));emit();}
    void clear(){voice.stop();voice.clearMediaItems();music.stop();music.clearMediaItems();id="";url="";title="";artist="";album="";error="";fallbackDuration=0;backgroundEnabled=false;musicURL="";musicError="";local=false;persist();stopSelf();emit();}
    void background(boolean enabled,String raw,float volume)throws Exception{
        if(enabled){Uri uri=mediaUri(raw);if(!raw.equals(musicURL)||music.getPlaybackState()==Player.STATE_IDLE){musicURL=raw;music.setMediaItem(MediaItem.fromUri(uri));music.prepare();}musicError="";}
        backgroundEnabled=enabled;musicVolume=Math.max(0,Math.min(.2f,volume));music.setVolume(musicVolume);followVoice();emit();
    }
    JSObject state(){
        long duration=voice.getDuration();return new JSObject().put("placeId",id).put("position",voice.getCurrentPosition()/1000.0).put("duration",duration>0?duration/1000.0:fallbackDuration)
            .put("playing",voice.isPlaying()).put("loading",voice.getPlaybackState()==Player.STATE_BUFFERING).put("speed",voice.getPlaybackParameters().speed).put("error",error)
            .put("backgroundEnabled",backgroundEnabled).put("backgroundPlaying",music.isPlaying()).put("backgroundError",musicError).put("local",local);
    }
    private void persist(){
        getSharedPreferences("KazanAudio",MODE_PRIVATE).edit().putString("id",id).putString("url",url).putString("title",title).putString("artist",artist).putString("album",album)
            .putLong("position",voice.getCurrentPosition()).putFloat("speed",voice.getPlaybackParameters().speed).putFloat("duration",(float)fallbackDuration).apply();
    }
    private void restore(){
        SharedPreferences saved=getSharedPreferences("KazanAudio",MODE_PRIVATE);String track=saved.getString("id","");if(track.isEmpty())return;
        try{load(track,saved.getString("url",""),saved.getString("title",""),saved.getString("artist",""),saved.getString("album",""),saved.getLong("position",0)/1000.0,saved.getFloat("duration",0),saved.getFloat("speed",1));}catch(Exception ignored){/* Removed offline files must not cause startup failure. */}
    }
    @Override public void onDestroy(){persist();handler.removeCallbacksAndMessages(null);observers.clear();if(session!=null)session.release();voice.release();music.release();super.onDestroy();}
}
