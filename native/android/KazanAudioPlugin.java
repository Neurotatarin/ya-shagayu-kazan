package ru.yashagayu.kazan.demo;

import android.content.*;
import android.os.*;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.*;

@CapacitorPlugin(name="KazanAudio")
public final class KazanAudioPlugin extends Plugin {
    private KazanPlaybackService service;
    private boolean bound;
    private final Handler main=new Handler(Looper.getMainLooper());
    private final List<Runnable> waiting=new ArrayList<>();
    private final Runnable observer=()->{if(service!=null)notifyListeners("stateChange",service.state());};
    private final ServiceConnection connection=new ServiceConnection(){
        @Override public void onServiceConnected(ComponentName name,IBinder binder){service=((KazanPlaybackService.LocalBinder)binder).service();service.observe(observer);for(Runnable task:new ArrayList<>(waiting))task.run();waiting.clear();}
        @Override public void onServiceDisconnected(ComponentName name){service=null;}
    };
    @Override public void load(){bound=getContext().bindService(new Intent(getContext(),KazanPlaybackService.class).setAction(KazanPlaybackService.BIND),connection,Context.BIND_AUTO_CREATE);}
    interface Action{void run()throws Exception;}
    private void perform(PluginCall call,Action action){main.post(()->{
        Runnable task=()->{try{action.run();call.resolve(service.state());}catch(Exception error){String code="AUDIO_URL_REJECTED".equals(error.getMessage())?"AUDIO_URL_REJECTED":"AUDIO_PLAY_FAILED";call.reject(code,code);}};
        if(service!=null){task.run();return;}waiting.add(task);main.postDelayed(()->{if(waiting.remove(task))call.reject("AUDIO_BRIDGE_UNAVAILABLE","AUDIO_BRIDGE_UNAVAILABLE");},5000);
    });}
    @PluginMethod public void loadTrack(PluginCall call){perform(call,()->service.load(call.getString("id",""),call.getString("url",""),call.getString("title",""),call.getString("artist",""),call.getString("album",""),call.getDouble("position",0.0),call.getDouble("duration",0.0),call.getFloat("speed",1f)));}
    @PluginMethod public void play(PluginCall call){perform(call,()->service.play());}
    @PluginMethod public void pause(PluginCall call){perform(call,()->service.pause());}
    @PluginMethod public void clearTrack(PluginCall call){perform(call,()->service.clear());}
    @PluginMethod public void seek(PluginCall call){perform(call,()->service.seek(call.getDouble("seconds",0.0)));}
    @PluginMethod public void setSpeed(PluginCall call){perform(call,()->service.speed(call.getFloat("speed",1f)));}
    @PluginMethod public void setBackground(PluginCall call){perform(call,()->service.background(call.getBoolean("enabled",false),call.getString("url",""),call.getFloat("volume",.08f)));}
    @PluginMethod public void getState(PluginCall call){main.post(()->{
        if(service!=null){call.resolve(service.state());return;}
        Runnable task=()->{if(service!=null)call.resolve(service.state());};waiting.add(task);main.postDelayed(()->{if(waiting.remove(task))call.reject("AUDIO_BRIDGE_UNAVAILABLE","AUDIO_BRIDGE_UNAVAILABLE");},5000);
    });}
    @Override protected void handleOnDestroy(){main.post(()->{if(service!=null)service.unobserve(observer);if(bound)getContext().unbindService(connection);bound=false;service=null;waiting.clear();});}
}
