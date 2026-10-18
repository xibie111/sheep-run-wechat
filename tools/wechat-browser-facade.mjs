/** First-party browser-only wx facade fixture. This is never platform evidence. */
export const browserFacadeHtml = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Browser facade — NOT WeChat</title>
<style>html,body{margin:0;background:#15281c;overflow:hidden}canvas{width:100vw!important;height:100vh!important;position:absolute;inset:0;image-rendering:pixelated}</style><body><script>
window.GameGlobal=new URLSearchParams(location.search).has('bare')?{}:window;
window.harness={events:{},modals:[],audio:[],storageCalls:[]};const h=harness,params=new URLSearchParams(location.search);
h.storageDenied=params.has('storageDenied');h.musicDenied=params.has('musicDenied');
localStorage.setItem('sheep-run-save','WEB_SAVE_SENTINEL');localStorage.setItem('sheep-run-wechat-poc-v1','POC_SENTINEL');
if(params.has('malformedStorage'))localStorage.setItem('sheep-run-wechat-save-v1',JSON.stringify({version:999,coins:713}));
if(params.has('stalled'))window.requestAnimationFrame=()=>1;
h.on=(n,cb)=>(h.events[n]??=new Set()).add(cb);h.off=(n,cb)=>h.events[n]?.delete(cb);h.emit=(n,e)=>{for(const cb of h.events[n]??[])cb(e)};
let first=true;
window.wx={createCanvas(){const c=document.createElement('canvas');if(first){first=false;document.body.appendChild(c)}return c},createImage(){return new Image()},
getWindowInfo(){return {windowWidth:innerWidth,windowHeight:innerHeight,pixelRatio:devicePixelRatio,safeArea:{left:20,top:0,right:innerWidth-12,bottom:innerHeight-10}}},
getMenuButtonBoundingClientRect(){return {left:innerWidth-100,top:8,right:innerWidth-15,bottom:40,width:85,height:32}},
getSystemInfoSync(){return {...this.getWindowInfo(),platform:'BROWSER_FACADE',SDKVersion:'NOT_WECHAT',version:'NOT_WECHAT',model:'Chromium touch emulation'}},
requestAnimationFrame(cb){return window.requestAnimationFrame(cb)},cancelAnimationFrame(id){window.cancelAnimationFrame(id)},
getStorageSync(key){h.storageCalls.push({op:'read',key});if(h.storageDenied)throw Error('injected storage denial');const v=localStorage.getItem(key);return v?JSON.parse(v):''},
setStorageSync(key,value){h.storageCalls.push({op:'write',key});if(h.storageDenied)throw Error('injected storage denial');localStorage.setItem(key,JSON.stringify(value))},
getFileSystemManager(){return {readFile(o){fetch(o.filePath).then(r=>{if(!r.ok)throw Error(r.status);return o.encoding?r.text():r.arrayBuffer()}).then(data=>o.success({data}),o.fail)}}},
loadSubpackage(o){if(h.musicDenied&&o.name==='music'){o.fail('injected music subpackage failure');return}fetch('music/game.js').then(r=>{if(!r.ok)throw Error(r.status);o.success()},o.fail)},
createInnerAudioContext(){const a=new Audio(),entry={src:'',playing:false,plays:0,stops:0,request:0};h.audio.push(entry);let error;
return {set src(v){entry.src=v;a.src=v},set autoplay(v){a.autoplay=v},set loop(v){a.loop=v},set volume(v){a.volume=v},
play(){const request=++entry.request;a.play().catch(e=>{if(request===entry.request)error?.(String(e))})},stop(){entry.request++;entry.playing=false;entry.stops++;a.pause();a.currentTime=0},destroy(){entry.request++;a.pause();a.removeAttribute('src')},
onPlay(cb){a.addEventListener('playing',()=>{entry.playing=true;entry.plays++;cb()})},onError(cb){error=cb;a.addEventListener('error',()=>cb(a.error?.message))}}},
showModal(o){h.modals.push(o);console.error('WX_FACADE_MODAL',o.title,o.content)},exitMiniProgram(){h.exitRequested=true}};
for(const n of ['TouchStart','TouchMove','TouchEnd','TouchCancel','Hide','Show','WindowResize','Error']){wx['on'+n]=cb=>h.on(n,cb);wx['off'+n]=cb=>h.off(n,cb)}
for(const [event,name] of [['touchstart','TouchStart'],['touchmove','TouchMove'],['touchend','TouchEnd'],['touchcancel','TouchCancel']])addEventListener(event,e=>{if(e.cancelable)e.preventDefault();h.emit(name,{changedTouches:[...e.changedTouches].map(t=>({identifier:t.identifier,clientX:t.clientX,clientY:t.clientY}))})},{passive:false});
addEventListener('resize',()=>h.emit('WindowResize'));
</script><script src="platform.js"></script><script src="game.bundle.js"></script>`;
