package ru.yashagayu.kazan.demo;

import android.content.*;
import android.os.*;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.UiDevice;
import androidx.media3.session.*;
import com.google.common.util.concurrent.ListenableFuture;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public final class NativeCheck {
    final android.app.Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();
    final Handler main=new Handler(Looper.getMainLooper());
    String javascript(ActivityScenario<MainActivity> scenario,String expression)throws Exception{
        CountDownLatch ready=new CountDownLatch(1);AtomicReference<String> result=new AtomicReference<>();scenario.onActivity(activity->activity.getBridge().getWebView().evaluateJavascript(expression,value->{result.set(value);ready.countDown();}));assertTrue("JavaScript callback",ready.await(15,TimeUnit.SECONDS));return result.get();
    }
    void output(String name,String content)throws Exception{File dir=instrumentation.getTargetContext().getExternalFilesDir(null);try(FileOutputStream out=new FileOutputStream(new File(dir,name))){out.write(content.getBytes(StandardCharsets.UTF_8));}}
    void until(ActivityScenario<MainActivity> scenario,String expression)throws Exception{for(int i=0;i<120;i++){if("true".equals(javascript(scenario,"Boolean("+expression+")")))return;Thread.sleep(500);}fail("UI condition timed out: "+expression);}
    void screenshot(String name){UiDevice.getInstance(instrumentation).takeScreenshot(new File(instrumentation.getTargetContext().getExternalFilesDir(null),name+".png"));}
    void ui(ActivityScenario<MainActivity> scenario)throws Exception{
        UiDevice device=UiDevice.getInstance(instrumentation);
        until(scenario,"document.querySelector('.home-page') && document.fonts.status==='loaded'");
        assertEquals("\"android\"",javascript(scenario,"document.documentElement.dataset.nativeShell"));
        assertEquals("true",javascript(scenario,"document.fonts.check('20px Onest') && document.fonts.check('20px \\\"Tenor Sans\\\"')"));
        until(scenario,"Array.from(document.images).every(i=>i.complete&&i.naturalWidth>0)");screenshot("ui-home");
        for(String screen:new String[]{"map","place/ushkova","player/ushkova","zilant","profile","routes"}){
            javascript(scenario,"location.hash='/"+screen+"';true");
            String selector=screen.startsWith("place")?".place-page":screen.startsWith("player")?".player-page":screen.equals("map")?".map-page":screen.equals("zilant")?".chat-composer":screen.equals("profile")?".traveler-card":".themes-gallery";
            until(scenario,"document.querySelector('"+selector+"')");
            assertEquals(screen+" overflow","true",javascript(scenario,"document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight+1"));
            if(screen.equals("map")){until(scenario,"document.querySelector('[data-map-ready=true]') && document.querySelectorAll('[data-place-id]').length===20");screenshot("ui-map");}
            if(screen.startsWith("player"))screenshot("ui-player");
        }
        javascript(scenario,"location.hash='/zilant';true");until(scenario,"document.querySelector('.chat-composer input')");
        // Focus the real input via an actual touch, rather than JS-only focus.
        String raw=javascript(scenario,"JSON.stringify((()=>{const r=document.querySelector('.chat-composer input').getBoundingClientRect();return {x:(r.x+r.width/2)*devicePixelRatio,y:(r.y+r.height/2)*devicePixelRatio}})())");
        JSONObject point=new JSONObject((String)new JSONTokener(raw).nextValue());device.click(point.getInt("x"),point.getInt("y"));Thread.sleep(1800);
        assertEquals("true",javascript(scenario,"visualViewport.scale===1 && document.documentElement.scrollWidth<=innerWidth"));
        screenshot("ui-keyboard");device.pressBack();Thread.sleep(700);until(scenario,"document.querySelector('.chat-composer')");
        device.pressBack();until(scenario,"document.querySelector('.home-page')");
        // Native back must restore a real map repeatedly, without a blank view.
        for(int i=0;i<3;i++){
            javascript(scenario,"location.hash='/player/ushkova';true");until(scenario,"document.querySelector('.player-page')");device.pressBack();until(scenario,"document.querySelector('[data-map-ready=true]')");
            assertEquals("true",javascript(scenario,"document.querySelector('.maplibregl-canvas').getBoundingClientRect().height>300"));device.pressBack();until(scenario,"document.querySelector('.home-page')");
        }
        // Selected-language fallback stays disabled for a recording that does
        // not exist. Reuse the actual language control and original RTL layout.
        javascript(scenario,"localStorage.setItem('kazan:language:v1','ar');location.reload();true");until(scenario,"document.documentElement.dir==='rtl' && document.querySelector('.home-page')");
        assertEquals("true",javascript(scenario,"document.documentElement.scrollWidth<=innerWidth"));screenshot("ui-arabic");
        javascript(scenario,"location.hash='/player/ushkova';true");until(scenario,"document.querySelector('.player-page')");assertEquals("true",javascript(scenario,"document.querySelector('.player-page .play-action').disabled"));
        javascript(scenario,"localStorage.setItem('kazan:language:v1','ru');location.reload();true");until(scenario,"document.documentElement.lang==='ru'");
        // Runtime geolocation uses the emulator GPS, deliberately outside Kazan.
        instrumentation.getUiAutomation().grantRuntimePermission("ru.yashagayu.kazan.demo","android.permission.ACCESS_COARSE_LOCATION");
        instrumentation.getUiAutomation().grantRuntimePermission("ru.yashagayu.kazan.demo","android.permission.ACCESS_FINE_LOCATION");
        javascript(scenario,"window.geoCheck=null;navigator.geolocation.getCurrentPosition(p=>window.geoCheck={lat:p.coords.latitude,lon:p.coords.longitude},e=>window.geoCheck={error:e.code},{enableHighAccuracy:true,timeout:20000});true");
        until(scenario,"window.geoCheck!==null");String geo=javascript(scenario,"JSON.stringify(window.geoCheck)");JSONObject coords=new JSONObject((String)new JSONTokener(geo).nextValue());assertFalse("GPS denied",coords.has("error"));assertEquals(55.75,coords.getDouble("lat"),.02);assertEquals(37.62,coords.getDouble("lon"),.02);
        output("ui.json",new JSONObject().put("screens",7).put("noOverflow",true).put("keyboardScale",1).put("nativeBack",true).put("rtl",true).put("realEmulatorGPS",true).toString());
    }
    @Test public void nativeLifecycle()throws Exception{
        String phase=InstrumentationRegistry.getArguments().getString("phase","online");
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            Thread.sleep(2500);
            if("ui".equals(phase)){ui(scenario);return;}
            scenario.onActivity(activity->activity.getBridge().getWebView().loadUrl("https://localhost/__native_check/index.html?phase="+phase));
            JSONObject result=null;String stage="";
            for(int i=0;i<720;i++){
                Thread.sleep(1000);String raw=javascript(scenario,"JSON.stringify(window.kazanSmokeResult || null)");
                String current=javascript(scenario,"window.kazanSmokeStage || ''");
                if(!current.equals(stage)){stage=current;System.out.println("Android "+phase+" stage "+stage);output("progress-"+phase+".txt",stage);}
                if(raw!=null&&!"null".equals(raw)){Object decoded=new JSONTokener(raw).nextValue();if(decoded instanceof String text&&!"null".equals(text)){result=new JSONObject(text);break;}}
            }
            assertNotNull("Native scenario timed out at "+stage,result);output("result-"+phase+".json",result.toString(2));assertTrue(result.toString(),result.optBoolean("ok"));
            UiDevice device=UiDevice.getInstance(instrumentation);device.takeScreenshot(new File(instrumentation.getTargetContext().getExternalFilesDir(null),"screen-"+phase+".png"));
            if("offline".equals(phase)){
                Context context=instrumentation.getTargetContext();AtomicReference<ListenableFuture<MediaController>> pending=new AtomicReference<>();
                instrumentation.runOnMainSync(()->pending.set(new MediaController.Builder(context,new SessionToken(context,new ComponentName(context,KazanPlaybackService.class))).buildAsync()));
                MediaController controller=pending.get().get(15,TimeUnit.SECONDS);AtomicLong before=new AtomicLong(),after=new AtomicLong();
                instrumentation.runOnMainSync(()->before.set(controller.getCurrentPosition()));
                device.pressHome();device.sleep();Thread.sleep(5500);
                instrumentation.runOnMainSync(()->after.set(controller.getCurrentPosition()));assertTrue("Audio stopped while screen locked",after.get()>before.get()+4000);
                instrumentation.runOnMainSync(controller::pause);Thread.sleep(700);instrumentation.runOnMainSync(()->before.set(controller.getCurrentPosition()));Thread.sleep(900);instrumentation.runOnMainSync(()->after.set(controller.getCurrentPosition()));assertTrue("System pause failed",Math.abs(after.get()-before.get())<200);
                instrumentation.runOnMainSync(()->{controller.seekTo(60000);controller.play();});Thread.sleep(2000);instrumentation.runOnMainSync(()->after.set(controller.getCurrentPosition()));assertTrue("System seek/play failed",after.get()>61000);
                instrumentation.runOnMainSync(()->{controller.pause();controller.release();});device.wakeUp();device.pressMenu();
                output("background.json",new JSONObject().put("lockedPlayback",true).put("systemPause",true).put("systemSeekResume",true).toString());
                // Check the production page too, without the browser catalog
                // cache. Its catalog/images/audio must come from native files.
                context.startActivity(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_SINGLE_TOP));Thread.sleep(1200);
                javascript(scenario,"localStorage.removeItem('kazan:catalog:v1');true");
                scenario.onActivity(activity->activity.getBridge().getWebView().loadUrl("https://localhost/#/player/ushkova"));
                until(scenario,"document.querySelector('.player-page .play-action:not(:disabled)')");
                until(scenario,"Array.from(document.images).every(i=>i.complete&&i.naturalWidth>0)");
                javascript(scenario,"document.querySelector('.play-action').click();true");until(scenario,"document.querySelector('.play-action[aria-label=\"Пауза\"]')");screenshot("ui-offline-player");
                device.pressBack();until(scenario,"document.querySelector('[data-map-ready=true]')");
                assertEquals("true",javascript(scenario,"!!document.querySelector('.mini-player') && document.documentElement.scrollWidth<=innerWidth"));screenshot("ui-offline-map");
                output("offline-production-ui.json",new JSONObject().put("catalogWithoutBrowserCache",true).put("localPhotos",true).put("localPlayback",true).put("mapAndMiniPlayer",true).toString());
            }
        }
    }
}
