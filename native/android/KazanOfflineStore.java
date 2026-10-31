package ru.yashagayu.kazan.demo;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.util.AtomicFile;
import org.json.*;
import javax.net.ssl.HttpsURLConnection;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.util.zip.GZIPInputStream;

/** Private, content-addressed files; a manifest is committed only after every asset. */
final class KazanOfflineStore {
    static final long MAP_LIMIT=50_000_000L, PACKAGE_LIMIT=300_000_000L, RESERVE=200_000_000L;
    static final String AGENT="YaShagayuKazan/0.4 (Android offline; github.com/Neurotatarin/ya-shagayu-kazan)";
    final File root, files, manifests;
    final Context context;
    final AtomicBoolean busy=new AtomicBoolean(), cancelled=new AtomicBoolean();
    volatile JSONObject transfer;
    final Set<HttpsURLConnection> connections=ConcurrentHashMap.newKeySet();
    private final Map<String,Long> estimates=new ConcurrentHashMap<>();
    private final Map<String,File> paths=new ConcurrentHashMap<>();
    interface Progress { void update(JSONObject value); }
    static final class Failure extends IOException { final String code; Failure(String code){super(code);this.code=code;} }
    KazanOfflineStore(Context context) throws IOException { this(context,new File(context.getNoBackupFilesDir(),"KazanOffline")); }
    KazanOfflineStore(Context context,File root) throws IOException {
        this.context=context.getApplicationContext(); this.root=root; files=new File(root,"files");manifests=new File(root,"packages");
        if(!files.isDirectory()&&!files.mkdirs() || !manifests.isDirectory()&&!manifests.mkdirs())throw new Failure("OFFLINE_STORAGE");
    }
    static String hash(String raw) {
        try { byte[] digest=MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8));char[] out=new char[digest.length*2];String hex="0123456789abcdef";for(int i=0;i<digest.length;i++){int b=digest[i]&255;out[i*2]=hex.charAt(b>>>4);out[i*2+1]=hex.charAt(b&15);}return new String(out); }
        catch(Exception e){throw new IllegalStateException(e);}
    }
    static URL allowed(String raw) throws Failure {
        try {
            URI uri=new URI(raw);String host=uri.getHost(),path=uri.getPath();
            if(!"https".equals(uri.getScheme())||uri.getUserInfo()!=null||uri.getFragment()!=null||uri.getPort()!=-1&&uri.getPort()!=443||path==null||Arrays.asList(path.split("/")).contains(".."))throw new Exception();
            if(!"tiles.openfreemap.org".equals(host)&&!("kazan-demo.38-180-191-162.sslip.io".equals(host)&&path.startsWith("/media/")))throw new Exception();
            return uri.toURL();
        }catch(Exception e){throw new Failure("OFFLINE_URL_REJECTED");}
    }
    File file(String raw) {
        return paths.computeIfAbsent(raw,key->{
            String path=URI.create(key).getPath(),ext=path.substring(path.lastIndexOf('.')+1).toLowerCase(Locale.ROOT);
            if(!ext.matches("[a-z0-9]{1,6}"))ext="bin";
            return new File(files,hash(key)+"."+ext);
        });
    }
    File localAudio(String raw) {
        try {
            File candidate;
            if(raw.startsWith("file:"))candidate=new File(new URI(raw));else { allowed(raw);candidate=file(raw); }
            String name=candidate.getName();
            if(!name.endsWith(".mp3")&&!name.endsWith(".m4a"))return null;
            return candidate.isFile()&&candidate.length()>0&&candidate.getCanonicalPath().startsWith(files.getCanonicalPath()+File.separator)?candidate:null;
        }catch(Exception e){return null;}
    }
    boolean connected() {
        ConnectivityManager manager=context.getSystemService(ConnectivityManager.class);
        NetworkCapabilities caps=manager.getNetworkCapabilities(manager.getActiveNetwork());
        return caps!=null&&caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)&&caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
    }
    private File manifest(String id) throws Failure { if(!id.matches("[A-Za-z0-9_-]{1,120}"))throw new Failure("OFFLINE_PREPARE");return new File(manifests,id+".json"); }
    synchronized JSONArray packages() {
        JSONArray result=new JSONArray();File[] list=manifests.listFiles((d,n)->n.endsWith(".json")||n.endsWith(".json.bak"));if(list==null)return result;
        // Older Android AtomicFile implementations can leave only .bak after
        // a process death. Discover its base before garbage collecting blobs.
        SortedSet<String> names=new TreeSet<>();for(File entry:list)names.add(entry.getName().replaceFirst("\\.bak$",""));
        for(String name:names)try {
            File entry=new File(manifests,name);
            JSONObject pack=new JSONObject(new String(new AtomicFile(entry).readFully(),StandardCharsets.UTF_8));JSONArray assets=pack.getJSONArray("assets");JSONObject paths=new JSONObject();boolean complete=true;
            for(int i=0;i<assets.length();i++){String url=assets.getJSONObject(i).getString("url");allowed(url);File item=file(url);if(!item.isFile()){complete=false;break;}paths.put(url,item.toURI().toString().replace("file:/","file:///"));}
            if(complete)result.put(pack.put("files",paths));
        }catch(Exception ignored){ /* A corrupt/incomplete package never appears as downloaded. */ }
        return result;
    }
    JSONObject state() throws JSONException { return new JSONObject().put("ready",true).put("connected",connected()).put("packages",packages()).put("transfer",transfer).put("error",""); }
    private static String canonical(Object value) throws JSONException {
        if(value instanceof JSONObject object){List<String> keys=new ArrayList<>();object.keys().forEachRemaining(keys::add);Collections.sort(keys);List<String> entries=new ArrayList<>();for(String key:keys)entries.add(JSONObject.quote(key)+":"+canonical(object.get(key)));return "{"+String.join(",",entries)+"}";}
        if(value instanceof JSONArray array){List<String> entries=new ArrayList<>();for(int i=0;i<array.length();i++)entries.add(canonical(array.get(i)));return "["+String.join(",",entries)+"]";}
        String scalar=new JSONArray().put(value).toString();return scalar.substring(1,scalar.length()-1);
    }
    private void validate(JSONObject plan) throws Exception {
        if(plan.getInt("schema")!=1||!Arrays.asList("ru","en","ar").contains(plan.getString("language")))throw new Failure("OFFLINE_PREPARE");
        manifest(plan.getString("id"));JSONArray assets=plan.getJSONArray("assets");if(assets.length()==0||assets.length()>10000)throw new Failure("OFFLINE_LIMIT");
        int tiles=0;Set<String> seen=new HashSet<>();
        for(int i=0;i<assets.length();i++){JSONObject asset=assets.getJSONObject(i);String url=asset.getString("url");allowed(url);if(!seen.add(url)||!Arrays.asList("map","media").contains(asset.getString("kind")))throw new Failure("OFFLINE_PREPARE");if(asset.optBoolean("tile"))tiles++;}
        if(tiles>3000)throw new Failure("OFFLINE_MAP_TOO_LARGE");
        if("content".equals(plan.optString("kind")))for(int i=0;i<assets.length();i++)if(!"media".equals(assets.getJSONObject(i).getString("kind")))throw new Failure("OFFLINE_PREPARE");
    }
    HttpsURLConnection open(String raw,String method) throws Exception {
        HttpsURLConnection connection=(HttpsURLConnection)allowed(raw).openConnection();
        connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(20000);connection.setReadTimeout(30000);connection.setRequestMethod(method);
        connection.setRequestProperty("User-Agent",AGENT);connection.setRequestProperty("Accept-Encoding","gzip");connection.setUseCaches(false);
        return connection;
    }
    static InputStream decoded(HttpsURLConnection connection) throws IOException {
        InputStream stream=connection.getInputStream();return "gzip".equalsIgnoreCase(connection.getContentEncoding())?new GZIPInputStream(stream):stream;
    }
    JSONObject metadata(String raw) throws Exception {
        HttpsURLConnection connection=open(raw,"GET");
        try { if(connection.getResponseCode()!=200)throw new Failure("OFFLINE_NETWORK");try(InputStream in=decoded(connection);ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] buffer=new byte[16384];int count;while((count=in.read(buffer))!=-1){if(out.size()+count>2_000_000)throw new Failure("OFFLINE_LIMIT");out.write(buffer,0,count);}return new JSONObject(new String(out.toByteArray(),StandardCharsets.UTF_8));
        }}finally{connection.disconnect();}
    }
    JSONObject estimate(JSONObject plan) throws Exception {
        validate(plan);if(busy.get())throw new Failure("OFFLINE_BUSY");long upper=0;boolean missingMap=false;JSONArray assets=plan.getJSONArray("assets");
        for(int i=0;i<assets.length();i++){
            JSONObject asset=assets.getJSONObject(i);String raw=asset.getString("url");if(file(raw).isFile())continue;
            if("map".equals(asset.getString("kind"))){missingMap=true;continue;}
            HttpsURLConnection connection=open(raw,"HEAD");try { if(connection.getResponseCode()!=200||connection.getContentLengthLong()<0)throw new Failure("OFFLINE_NETWORK");upper+=connection.getContentLengthLong(); }finally{connection.disconnect();}
        }
        if(missingMap)upper+=MAP_LIMIT;if(upper>PACKAGE_LIMIT)throw new Failure("OFFLINE_LIMIT");
        estimates.put(hash(canonical(plan)),upper);long available=root.getUsableSpace();return new JSONObject().put("upperBytes",upper).put("availableBytes",available).put("enoughSpace",available>=upper+RESERVE);
    }
    void cancel(){cancelled.set(true);for(HttpsURLConnection connection:connections)connection.disconnect();}
    private void check() throws Failure {if(cancelled.get()||Thread.currentThread().isInterrupted())throw new Failure("OFFLINE_CANCELLED");if(root.getUsableSpace()<RESERVE)throw new Failure("OFFLINE_STORAGE");}
    void download(JSONObject source,Progress progress) throws Exception {
        validate(source);Long upper=estimates.get(hash(canonical(source)));if(upper==null)throw new Failure("OFFLINE_PREPARE");
        if(root.getUsableSpace()<upper+RESERVE)throw new Failure("OFFLINE_STORAGE");if(!busy.compareAndSet(false,true))throw new Failure("OFFLINE_BUSY");
        cancelled.set(false);ExecutorService workers=Executors.newFixedThreadPool(2);List<Future<Void>> futures=new ArrayList<>();
        AtomicLong bytes=new AtomicLong(),mapBytes=new AtomicLong(),last=new AtomicLong();AtomicInteger completed=new AtomicInteger();JSONArray assets=source.getJSONArray("assets");String id=source.getString("id");
        Runnable notify=()->{long now=System.nanoTime();if(now-last.get()<200_000_000&&completed.get()<assets.length())return;last.set(now);try{transfer=new JSONObject().put("id",id).put("phase","downloading").put("completed",completed.get()).put("total",assets.length()).put("bytes",bytes.get());progress.update(transfer);}catch(JSONException ignored){}};
        notify.run();
        try {
            ExecutorCompletionService<Void> tasks=new ExecutorCompletionService<>(workers);
            for(int i=0;i<assets.length();i++){
                JSONObject asset=assets.getJSONObject(i);
                futures.add(tasks.submit(()->{
                    check();String raw=asset.getString("url");File target=file(raw);boolean map="map".equals(asset.getString("kind"));
                    if(!target.isFile())fetchAsset(raw,target,map,bytes,mapBytes,notify);else{bytes.addAndGet(target.length());if(map)mapBytes.addAndGet(target.length());}
                    if(mapBytes.get()>MAP_LIMIT||bytes.get()>PACKAGE_LIMIT)throw new Failure("OFFLINE_LIMIT");completed.incrementAndGet();notify.run();return null;
                }));
            }
            for(int i=0;i<assets.length();i++)try{tasks.take().get();}catch(ExecutionException failure){throw failure.getCause() instanceof Exception e?e:new Failure("OFFLINE_NETWORK");}
            check();
            synchronized(this){
                if("content".equals(source.optString("kind"))&&!manifest(source.getString("mapId")).isFile())throw new Failure("OFFLINE_PREPARE");
                java.text.SimpleDateFormat date=new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'",Locale.ROOT);date.setTimeZone(TimeZone.getTimeZone("UTC"));
                JSONObject pack=new JSONObject(source.toString()).put("downloadedAt",date.format(new Date())).put("bytes",bytes.get());
                AtomicFile destination=new AtomicFile(manifest(id));FileOutputStream stream=null;
                try{stream=destination.startWrite();stream.write(pack.toString().getBytes(StandardCharsets.UTF_8));destination.finishWrite(stream);}catch(Exception e){if(stream!=null)destination.failWrite(stream);throw e;}
            }
        }catch(Exception failure){if(cancelled.get())throw new Failure("OFFLINE_CANCELLED");throw failure;}finally{
            cancelled.set(true);for(Future<?> future:futures)future.cancel(true);for(HttpsURLConnection connection:connections)connection.disconnect();workers.shutdownNow();workers.awaitTermination(35,TimeUnit.SECONDS);connections.clear();
            synchronized(this){collect();}transfer=null;busy.set(false);progress.update(new JSONObject().put("id",id).put("finished",true));
        }
    }
    private void fetchAsset(String raw,File target,boolean map,AtomicLong bytes,AtomicLong mapBytes,Runnable progress) throws Exception {
        File temp=new File(files,target.getName()+".part");HttpsURLConnection connection=open(raw,"GET");connections.add(connection);
        try {
            check();int status=connection.getResponseCode();
            boolean emptyGlyph=status==404&&map&&URI.create(raw).getPath().contains("/fonts/")&&URI.create(raw).getPath().endsWith(".pbf");
            if(status!=200&&!emptyGlyph)throw new Failure("OFFLINE_NETWORK");
            try(OutputStream out=new FileOutputStream(temp)){
                if(!emptyGlyph)try(InputStream in=decoded(connection)){byte[] buffer=new byte[32768];int count;
                    while((count=in.read(buffer))!=-1){check();long total=bytes.addAndGet(count),mapTotal=map?mapBytes.addAndGet(count):mapBytes.get();if(total>PACKAGE_LIMIT||mapTotal>MAP_LIMIT)throw new Failure("OFFLINE_LIMIT");out.write(buffer,0,count);progress.run();}
                }
            }
            check();if(!temp.renameTo(target))throw new Failure("OFFLINE_STORAGE");
        }finally{connections.remove(connection);connection.disconnect();if(temp.exists())temp.delete();}
    }
    synchronized void remove(String id) throws Exception {if(busy.get())throw new Failure("OFFLINE_BUSY");new AtomicFile(manifest(id)).delete();collect();}
    synchronized void collect() {
        Set<String> referenced=new HashSet<>();JSONArray packs=packages();
        for(int i=0;i<packs.length();i++){JSONArray assets=packs.optJSONObject(i).optJSONArray("assets");for(int j=0;j<assets.length();j++)referenced.add(file(assets.optJSONObject(j).optString("url")).getName());}
        File[] list=files.listFiles();if(list!=null)for(File entry:list)if(!referenced.contains(entry.getName()))entry.delete();
    }
}
