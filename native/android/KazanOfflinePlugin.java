package ru.yashagayu.kazan.demo;

import android.net.*;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import java.util.concurrent.*;

@CapacitorPlugin(name="KazanOffline")
public final class KazanOfflinePlugin extends Plugin {
    private KazanOfflineStore store;
    private final ExecutorService control=Executors.newSingleThreadExecutor(),downloads=Executors.newSingleThreadExecutor();
    private ConnectivityManager manager;
    private ConnectivityManager.NetworkCallback network;
    @Override public void load(){
        try{store=new KazanOfflineStore(getContext());store.collect();}catch(Exception ignored){}
        manager=getContext().getSystemService(ConnectivityManager.class);
        network=new ConnectivityManager.NetworkCallback(){
            private void changed(){if(store!=null)notifyListeners("networkChange",new JSObject().put("connected",store.connected()));}
            @Override public void onAvailable(Network n){changed();}
            @Override public void onLost(Network n){changed();}
            @Override public void onCapabilitiesChanged(Network n,NetworkCapabilities c){changed();}
        };
        manager.registerDefaultNetworkCallback(network);
    }
    interface Operation{JSObject run()throws Exception;}
    private void perform(PluginCall call,ExecutorService executor,Operation operation){executor.execute(()->{
        try{if(store==null)throw new KazanOfflineStore.Failure("OFFLINE_STORAGE");call.resolve(operation.run());}
        catch(Exception error){String code=error instanceof KazanOfflineStore.Failure f?f.code:"OFFLINE_NETWORK";call.reject(code,code);}
    });}
    private JSONObject plan(PluginCall call)throws Exception{JSObject value=call.getObject("plan");if(value==null)throw new KazanOfflineStore.Failure("OFFLINE_PREPARE");return value;}
    private JSObject value(JSONObject object)throws Exception{return new JSObject(object.toString());}
    @PluginMethod public void getState(PluginCall call){perform(call,control,()->value(store.state()));}
    @PluginMethod public void fetchMetadata(PluginCall call){perform(call,control,()->new JSObject().put("value",store.metadata(call.getString("url",""))));}
    @PluginMethod public void estimate(PluginCall call){perform(call,control,()->value(store.estimate(plan(call))));}
    @PluginMethod public void download(PluginCall call){perform(call,downloads,()->{
        store.download(plan(call),progress->{try{notifyListeners("transferChange",new JSObject(progress.toString()));}catch(Exception ignored){}});
        notifyListeners("packagesChange",new JSObject());return new JSObject().put("saved",true);
    });}
    @PluginMethod public void cancel(PluginCall call){if(store!=null)store.cancel();call.resolve();}
    @PluginMethod public void remove(PluginCall call){perform(call,control,()->{store.remove(call.getString("id",""));notifyListeners("packagesChange",new JSObject());return new JSObject();});}
    @Override protected void handleOnDestroy(){if(store!=null)store.cancel();if(manager!=null&&network!=null)manager.unregisterNetworkCallback(network);control.shutdownNow();downloads.shutdownNow();}
}
