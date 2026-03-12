<div id="app" class="container">
	<div v-for="item in setList">
		<h2>{{item.id}}</h2>
		<vue-perfectlooper v-bind="item"></vue-perfectlooper>
	</div>
</div>

#css

body{
margin: 0;
padding: 0;
padding-top: 50px;
padding-bottom: 300px;
font-family: sans-serif;
font-size: 16px;
color: #ccc;
background-color: #000;
}
a{
color: #9f0;
}
h1, h2, p{
margin: 0;
padding: 1rem;
}
.container{
position: relative;
margin: 0 auto;
}

.perfectlooper:after{
display: block;
content: ' ';
padding: 1rem 0;
}

@media (min-width: 720px) {
.container{
width: 720px;
margin: 0 auto;
}
}
@media (min-width: 960px) {
.container {
width: 960px;
}
}

#js

Vue.component('vue-perfectlooper', VuePerfectlooper);

let ringOfFire = ["iZbBEv/00", "hW6BEv/01", "eDtf7F/02", "ezzL7F/03", "cLDPZv/04", "kgpbga/05", "gq607F/06", "nHfSnF/07", "nnatSF/08", "iSj91a/09", "eMfGga/10", "hLSJuv/11", "fJmBEv/12", "c6QhMa/13", "gzftSF/14", "kFqGga/15", "gXvGga/16", "jcvGga/17", "mLV4Zv/18", "bChJuv/19", "jZ1BEv/20", "bMyrEv/21", "f5V4Zv/22", "gGi2Ma/23", "dOJiuv/24", "c0yiuv/25", "nJ13uv/26", "eMEZ1a/27", "gREZ1a/28", "cUaJSF/29", "hXqk7F/30", "jTepZv/31", "mmM3uv/32", "nC4Z1a/33", "iEe1ga/34", "kJtiuv/35", "f2HXnF/36", "id9Ouv/37", "eR2bEv/38", "k8vUZv/39", "eSou1a/40", "e98iuv/41", "k6Ou1a/42", "fVDSMa/43", "diYSMa/44", "czoGEv/45", "i307Ma/46", "jq4CnF/47", "ioRa7F/48", "f9hF7F/49", "gpqeZv/50", "eYDcMa/51", "mk7REv/52", "j6R8SF/53", "hKBxMa/54", "f9ntuv/55", "mh7tuv/56", "e9N41a/57", "hsBa7F/58", "gbnF7F/59", "mWVrga/60", "j6WmEv/61", "bHOcMa/62", "esTBga/63", "cqn41a/64", "ciqP1a/65", "hPtNnF/66", "ctsF7F/67", "mXQP1a/68", "f7OYuv/69", "jVWa7F/70", "dactuv/71", "cxoNnF/72", "cz7F7F/73", "byArga/74", "m8VDuv/75", "j0iNnF/76", "iNvrga/77", "kvHhnF/78", "iPEj1a/79", "ddnhnF/80", "eKrWga/81", "fMMWga/82", "bO1a7F/83", "mRdzZv/84", "mopTSF/85", "hUk2nF/86", "bBR8SF/87", "g5Q2nF/88", "jZWKZv/89", "byK6Ev/90", "gFStuv/91", "m2nREv/92", "jjfP1a/93", "iU1mEv/94", "keEj1a/95", "hM7hnF/96", "bBWmEv/97", "dOSREv/98", "gUQrga/99", "j4VP1a/100", "frev7F/101", "gGNREv/102", "dLga7F/103", "hSNhnF/104", "cCmWga/105", "bBp6Ev/106", "kwHtuv/107", "d0OBga/108", "gUUTSF/109", "d2wmEv/110", "hnKv7F/111", "fkdoSF/112", "hC0P1a/113", "nMQDuv/114", "ggxREv/115", "hN2F7F/116", "fwCF7F/117", "i2AeZv/118", "f5ToSF/119"];

let blueFlame = ["bArQPv/00", "gkKC4v/01", "fpzZHF/02", "hJzOBa/03", "m5qVra/04", "jTOTcF/05", "fQdTcF/06", "bV4OBa/07", "kZ8uHF/08", "c11s4v/09", "cDfwWa/10", "hk2X4v/11", "j76gxF/12", "jvWEHF/13", "go6Lra/14", "fmgycF/15", "jOmycF/16", "ga8YBa/17", "bFBLra/18", "nsX4HF/19", "iiO0ra/20", "cFS4HF/21", "dORmWa/22", "cJvDBa/23", "fFhh4v/24", "k1ydcF/25", "d7Opjv/26", "jhFPHF/27", "gT4Ujv/28", "gkstBa/29", "fn4JcF/30", "dfmvra/31", "cDXqPv/32", "gtWvra/33", "mPmjjv/34", "hTjgWa/35", "hkHPjv/36", "nNYVPv/37", "nzix4v/38", "fEcPjv/39", "f3utcF/40", "dzkoBa/41", "bWseHF/42", "n9zgWa/43", "d1Dx4v/44", "jmC1Wa/45", "mfnJBa/46", "nFT3cF/47", "ix3Qra/48", "dHyrWa/49", "kfq5ra/50", "n9WZjv/51", "n6W0Pv/52", "nJ5S4v/53", "eipn4v/54", "mEC74v/55", "hqc74v/56", "dSX74v/57", "fCh74v/58", "m26jjv/59", "b6egWa/60", "mxYara/61", "nBvMWa/62", "eGcqPv/63", "e3G6xF/64", "gtvoBa/65", "eGgTBa/66", "gp3KHF/67", "f54RxF/68", "eCqzHF/69", "kcXeHF/70", "hhb6xF/71", "bJJx4v/72", "c5N1Wa/73", "kTgvra/74", "d9dKHF/75", "gO5zHF/76", "gGDx4v/77", "hSCDcF/78", "ggiKHF/79", "n0M6xF/80", "jK5APv/81", "nnE4jv/82", "dCtmxF/83", "jFJKHF/84", "bRAAPv/85", "iHfoBa/86", "mj2Pjv/87", "cvomxF/88", "nEcPjv/89", "d7Lc4v/90", "d2vYcF/91", "igKRxF/92", "iUAoBa/93", "hVWH4v/94", "bymTBa/95", "k9Yx4v/96", "nz71Wa/97", "b5Z4jv/98", "mBaS4v/99", "ky4bxF/100", "eFmOcF/101", "eQZWWa/102", "nwGBWa/103", "cU8Qra/104", "gWV5ra/105", "i0E9HF/106", "m2dQra/107", "fTJQra/108", "c2bdBa/109", "bMTEjv/110", "i1ELPv/111", "h3fS4v/112", "jkJrWa/113", "fV9WWa/114", "e63Ejv/115", "cSHJBa/116", "giaujv/117", "ezGH4v/118", "icwTBa/119"];

let darkWater = ["iNsrz5/00", "bHiaRk/01", "cMWUmk/02", "imNDCQ/03", "d2QBz5/04", "mhgjK5/05", "mbHfsQ/06", "htH26k/07", "mHF0sQ/08", "i1GjK5/09", "kUQde5/10", "bXgjK5/11", "fQTWz5/12", "euQYCQ/13", "kNYaRk/14", "esBJe5/15", "kSF0sQ/16", "d9zh6k/17", "hfhDCQ/18", "dDvpmk/19", "jvj4K5/20", "nukpmk/21", "iD9AsQ/22", "dz6ZK5/23", "kwYs6k/24", "gGxkRk/25", "iaezmk/26", "j5wemk/27", "f0d3CQ/28", "mgSKmk/29", "fBCVsQ/30", "fVoEK5/31", "mohKmk/32", "isnkRk/33", "dcys6k/34", "dkS8e5/35", "fMKzmk/36", "i4C8e5/37", "fWeAsQ/38", "fk8gz5/39", "e0NVsQ/40", "jZUoe5/41", "m1uzmk/42", "b8ckRk/43", "kXRemk/44", "fLwemk/45", "htHVsQ/46", "cXi3CQ/47", "g1uzmk/48", "fFNVsQ/49", "gYJQRk/50", "h5wZK5/51", "dzo3CQ/52", "dVRC6k/53", "d17wXQ/54", "faF5Rk/55", "ixi3CQ/56", "nC78e5/57", "kRdEK5/58", "fCbemk/59", "i3tQRk/60", "hQ5uK5/61", "hAVuK5/62", "hSh8e5/63", "mfNVsQ/64", "d6uzmk/65", "cVd3CQ/66", "htWOCQ/67", "ehEX6k/68", "e6AiCQ/69", "nBjoe5/70", "gmYLsQ/71", "it6vRk/72", "g7c26k/73", "bEBjK5/74", "k1GjK5/75", "gK2PK5/76", "cEfBz5/77", "cOwjK5/78", "nKg6XQ/79", "jNzFRk/80", "coH26k/81", "mTXrz5/82", "bTDLsQ/83", "cJgvRk/84", "m5TaRk/85", "cWoye5/86", "fEbUmk/87", "gQSfsQ/88", "iGn26k/89", "eAQpmk/90", "fxUtCQ/91", "jz4FRk/92", "eiU4K5/93", "daph6k/94", "ijDWz5/95", "nOmUmk/96", "kgVYCQ/97", "dB9FRk/98", "hZGJe5/99", "jtyWz5/100", "ntXrz5/101", "mc8Wz5/102", "dAOye5/103", "era0sQ/104", "fPxrz5/105", "jA2fsQ/106", "iHYWz5/107", "eBQ0sQ/108", "j5PtCQ/109", "mQ89mk/110", "fOFBz5/111", "jWwJe5/112", "esCDCQ/113", "dEPh6k/114", "euW6XQ/115", "gwjFRk/116", "kmmemk/117", "mgKzmk/118", "eQYgz5/119"];

function createLinks(endings){
return endings.map(function(item){
return 'https://image.ibb.co/' + item + '.jpg'
})
}

new Vue({
el: '#app',
data: {
setList: [
{
"id": "Inferno / Ring of Fire",
"poster": "https://image.ibb.co/j0iNnF/76.jpg",
"src": createLinks(ringOfFire)
},{
"id": "Inferno / Blue Flame",
"poster": "https://image.ibb.co/jFJKHF/84.jpg",
"src": createLinks(blueFlame)
},{
"id": "Inferno / Dark Water",
"poster": "https://image.ibb.co/fFNVsQ/49.jpg",
"src": createLinks(darkWater)
}
]
}
});
