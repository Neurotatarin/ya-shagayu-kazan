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
    @Test public void nativeLifecycle()throws Exception{
        String phase=InstrumentationRegistry.getArguments().getString("phase","online");
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            Thread.sleep(2500);
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
            }
        }
    }
}
