import { Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import catalog from "../../../server/catalog.json";
import route from "../../../tests/fixtures/walking-route.json";
import { backgroundMusic } from "../../../app/src/data/backgroundMusic";
import { audioSmoke } from "../web/audioSmoke";
import { initializeOffline, prepareOffline, downloadOffline, offlineSnapshot, cancelOffline, localMediaURL, removeOffline } from "../../../app/src/platform/offlineStore";
import { offlineMapStyle, offlineMapRequest, registerOfflineMapProtocol } from "../../../app/src/platform/offlineMap";
import { prepareMapWorker } from "../../../app/src/platform/mapWorker";
import type { DemoCatalog, WalkingRoute, PlaceImage } from "../../../app/src/domain/demo";

declare global { interface Window { kazanSmokeStage?:string;kazanSmokeResult?:Record<string,unknown>;kazanMapCounts?:number[];Capacitor:{nativePromise:(plugin:string,method:string,options?:unknown)=>Promise<Record<string,unknown>>} } }
const origin="https://kazan-demo.38-180-191-162.sslip.io";
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(value:unknown,code:string)=>{if(!value)throw new Error(code);};
const stage=(name:string)=>{window.kazanSmokeStage=name;document.getElementById("status")!.textContent=name;};
const call=(method:string,options:unknown={})=>window.Capacitor.nativePromise("KazanAudio",method,options);
async function waitAudio(predicate:(state:Record<string,unknown>)=>boolean){for(let i=0;i<100;i++){const state=await call("getState");assert(!state.error,"audio-error");if(predicate(state))return state;await sleep(300);}throw new Error("audio-timeout");}

async function online(){
  await initializeOffline();stage("download-prepare");
  const input={id:"android-native-check",title:"Native route check",language:"ru" as const,placeIds:route.placeIds,catalog:catalog as unknown as DemoCatalog,route:route as unknown as WalkingRoute};
  const prepared=await prepareOffline(input);assert(prepared.enoughSpace,"storage");
  stage("download-cancellation");
  const pending=downloadOffline(prepared.plan,prepared.cityPlan).then(()=>"saved",error=>String(error.code));
  for(let i=0;i<100;i++){const state=await window.Capacitor.nativePromise("KazanOffline","getState");if(state.transfer)break;await sleep(20);}
  await cancelOffline();assert(await pending==="OFFLINE_CANCELLED","cancel-not-atomic");
  assert(offlineSnapshot().packages.length===0,"incomplete-published");
  stage("download-full-city-and-route");const retry=await prepareOffline(input);await downloadOffline(retry.plan,retry.cityPlan);
  const packs=offlineSnapshot().packages,city=packs.find(p=>p.kind==="city-map")!,content=packs.find(p=>p.kind==="content")!;
  assert(city?.map.tileCount===1135&&city.bytes<=50_000_000,"city-count");
  assert(content?.assets.every(a=>a.kind==="media")&&content.route?.geometry.coordinates.length===route.geometry.coordinates.length,"content-route");
  stage("city-reuse-language");const other=await prepareOffline({...input,language:"en"});assert(!other.cityPlan&&other.mapBytes===0,"city-reused");
  return {cityBytes:city.bytes,cityTiles:city.map.tileCount,contentBytes:content.bytes,cancellation:true,sharedCity:true};
}
async function offline(){
  await initializeOffline();assert(!offlineSnapshot().connected,"device-still-online");
  const packs=offlineSnapshot().packages,city=packs.find(p=>p.kind==="city-map")!,content=packs.find(p=>p.kind==="content")!;
  assert(city&&content,"cold-start-no-packages");stage("offline-photos");
  let photos=0;
  for(const gallery of Object.values(content.galleries) as {items:PlaceImage[]}[])for(const photo of gallery.items){const url=localMediaURL(photo.url);assert(url,"missing-photo-file");const image=new Image();image.src=url!;await image.decode();assert(image.naturalWidth>0,"photo-empty");photos++;image.src="";}
  assert(photos>=30,"photo-count");
  stage("offline-map");registerOfflineMapProtocol();await prepareMapWorker();
  const diagnostics={mapErrors:[] as string[],photos,localOrigin:location.origin,localTileURL:localMediaURL(city.assets.find(a=>a.tile)!.url)};window.kazanSmokeDiagnostics=diagnostics;
  let network=0;const fetchLocal=fetch.bind(window);
  window.fetch=((resource:RequestInfo|URL,init?:RequestInit)=>{const raw=typeof resource==="string"?resource:resource instanceof URL?resource.href:resource.url;if(/^https?:/.test(raw)&&new URL(raw).origin!==location.origin){network++;return Promise.reject(new Error("external-network"));}return fetchLocal(resource,init);}) as typeof fetch;
  const map=new Map({container:"map",style:offlineMapStyle(city),transformRequest:offlineMapRequest,center:[49.12,55.79],zoom:14,attributionControl:false,fadeDuration:0});
  const counts:number[]=[];window.kazanMapCounts=counts;
  const idle=()=>new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("map-timeout")),60000);map.once("idle",()=>{clearTimeout(timer);resolve();});map.once("error",event=>{diagnostics.mapErrors.push(String(event.error?.message??"unknown").slice(0,400));clearTimeout(timer);reject(new Error("map-resource-error"));});map.getCanvas().addEventListener("webglcontextlost",()=>reject(new Error("map-context-lost")),{once:true});});
  await idle();
  map.addSource("saved-route",{type:"geojson",data:{type:"Feature",properties:{},geometry:content.route!.geometry}});
  map.addLayer({id:"saved-route",type:"line",source:"saved-route",paint:{"line-color":"#08734f","line-width":4}});
  for(const center of [[49.12,55.79],[49.05,55.82],[49.23,55.80],[49.14,55.72],[48.97,55.86],[49.30,55.87]] as [number,number][]){map.jumpTo({center,zoom:14});await idle();const count=map.queryRenderedFeatures().length;counts.push(count);assert(count>10,"blank-city-sector");}
  map.jumpTo({center:[49.12,55.79],zoom:14});await idle();assert(map.queryRenderedFeatures(undefined,{layers:["saved-route"]}).length>0,"saved-line-missing");assert(network===0,"map-network-fallback");
  stage("offline-local-audio-music");await call("loadTrack",{id:"ushkova@ru",url:origin+catalog.places.find(p=>p.id==="ushkova")!.audioUrl,title:"Дом Ушковой",artist:"Зилант",position:10,duration:255,speed:1});await call("play");
  const playing=await waitAudio(s=>s.local===true&&s.playing===true&&Number(s.position)>11);
  await call("setBackground",{enabled:true,url:origin+backgroundMusic.url,volume:.08});await waitAudio(s=>s.backgroundPlaying===true);
  await call("pause");const paused=await call("getState");await sleep(800);const still=await call("getState");assert(!still.playing&&!still.backgroundPlaying&&Math.abs(Number(still.position)-Number(paused.position))<.2,"pause-music-independence");
  await call("seek",{seconds:30});await call("setSpeed",{speed:1.5});await call("play");await waitAudio(s=>Number(s.position)>31&&Math.abs(Number(s.speed)-1.5)<.01);
  stage("offline-native-ready");return {photos,counts,network,coldStart:true,localAudio:true,music:true,position:playing.position};
}
async function removal(){await initializeOffline();const packs=offlineSnapshot().packages,city=packs.find(p=>p.kind==="city-map")!,content=packs.find(p=>p.kind==="content")!;await call("clearTrack");await removeOffline(city.id);assert(!offlineSnapshot().packages.some(p=>p.kind==="city-map"),"city-not-removed");assert(content.assets.every(a=>!!localMediaURL(a.url)),"map-deleted-content");assert((await fetch(localMediaURL(content.assets[0]!.url)!)).ok,"retained-file-missing");await removeOffline(content.id);assert(offlineSnapshot().packages.length===0,"remove-incomplete");return {independentRemoval:true};}
const phase=new URL(location.href).searchParams.get("phase");stage("document-ready");
void (phase==="offline"?offline():phase==="remove"?removal():audioSmoke(stage,online)).then(result=>{window.kazanSmokeResult={ok:true,phase,...result};}).catch(error=>{const code=String(error.code||error.message||"unknown");window.kazanSmokeResult={ok:false,stage:window.kazanSmokeStage,reason:/^[a-zA-Z0-9_-]{1,90}$/.test(code)?code:"unclassified",diagnostics:window.kazanSmokeDiagnostics};});
