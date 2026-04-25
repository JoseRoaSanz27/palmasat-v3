import { useState, useEffect, useCallback } from "react";

// ============================================================
// CONFIG — reemplaza con tu URL después de deployar el Apps Script
// ============================================================
const GAS_URL = "https://script.google.com/macros/s/AKfycbzxUWO3rJWHc68iP8RNgSG-_fTBzkvG4DA95kVRUAeZ1bcKXmtVVYCBJaWI-tCsEcpz/exec";

// ============================================================
// FALLBACK (datos hardcodeados si la API falla)
// ============================================================
const FINCA_FALLBACK = {
  nombre: "El Porvenir", propietario: "Jose Orlando Roa Sanchez",
  municipio: "Cantagallo, Bolívar", area: "18.5 ha",
  lat: 7.310, lng: -73.941, fechaImagen: "2025-04-01",
  nubosidad: "14.2%", lluvia: 243, anomalias: 36,
  lotes: [
    { id:"L1", material:"Híbrido Taisha",       siembra:"03/03/2011", edad:15,
      ndvi:0.8510, ndviPrev:0.8342, ndwi:0.042,  savi:null,  evi:0.631,
      tendencia:[0.776,0.852,0.838,0.858,0.855,0.851], anomalias:8 },
    { id:"L2", material:"Guineensis + Híbrido", siembra:"25/11/2022", edad:3,
      ndvi:0.8338, ndviPrev:0.8127, ndwi:0.018,  savi:0.412, evi:0.589,
      tendencia:[0.734,0.789,0.769,0.830,0.830,0.844], anomalias:4 },
    { id:"L3", material:"OxG Corpoica",         siembra:"25/11/2016", edad:9,
      ndvi:0.8294, ndviPrev:0.7175, ndwi:-0.031, savi:null,  evi:0.598,
      tendencia:[0.717,0.799,0.808,0.851,0.830,0.848], anomalias:18 },
    { id:"L4", material:"OxG Corpoica10",       siembra:"25/11/2016", edad:9,
      ndvi:0.8495, ndviPrev:0.8249, ndwi:0.011,  savi:null,  evi:0.624,
      tendencia:[0.825,0.835,0.779,0.835,0.824,0.846], anomalias:6 },
  ],
};

// ============================================================
// CLASIFICADORES
// ============================================================
function getNDVIStatus(ndvi, edad) {
  if (edad <= 3) {
    if (ndvi >= 0.78) return { label:"Óptimo/edad", color:"#52b788", bg:"#52b78818", nivel:1 };
    if (ndvi >= 0.65) return { label:"Normal/edad", color:"#81c995", bg:"#81c99518", nivel:2 };
    return { label:"Revisar", color:"#f4a261", bg:"#f4a26118", nivel:3 };
  }
  if (edad <= 7) {
    if (ndvi >= 0.82) return { label:"Óptimo",    color:"#1a5c38", bg:"#1a5c3818", nivel:1 };
    if (ndvi >= 0.75) return { label:"Saludable", color:"#52b788", bg:"#52b78818", nivel:2 };
    if (ndvi >= 0.65) return { label:"Alerta",    color:"#f4a261", bg:"#f4a26118", nivel:3 };
    return { label:"Crítico", color:"#e24b4a", bg:"#e24b4a18", nivel:4 };
  }
  if (ndvi >= 0.85) return { label:"Óptimo",    color:"#1a5c38", bg:"#1a5c3818", nivel:1 };
  if (ndvi >= 0.80) return { label:"Saludable", color:"#52b788", bg:"#52b78818", nivel:2 };
  if (ndvi >= 0.72) return { label:"Alerta",    color:"#f4a261", bg:"#f4a26118", nivel:3 };
  return { label:"Crítico", color:"#e24b4a", bg:"#e24b4a18", nivel:4 };
}

function getNDWIStatus(ndwi) {
  if (ndwi >= 0.1)   return { label:"Sin estrés", color:"#52b788", desc:"Balance hídrico óptimo" };
  if (ndwi >= -0.05) return { label:"Leve",       color:"#81c995", desc:"Monitorear en temporada seca" };
  if (ndwi >= -0.15) return { label:"Moderado",   color:"#f4a261", desc:"Considerar riego suplementario" };
  if (ndwi >= -0.25) return { label:"Severo",     color:"#e07b39", desc:"Riego urgente recomendado" };
  return { label:"Crítico", color:"#e24b4a", desc:"Riesgo de daño permanente en raíces" };
}

function getSAVIStatus(savi, edad) {
  if (edad > 4) return null;
  if (savi >= 0.45) return { label:"Dosel cerrando",    color:"#52b788", desc:"Cobertura vegetal adecuada para la edad" };
  if (savi >= 0.30) return { label:"Desarrollo normal", color:"#81c995", desc:"Interferencia de suelo moderada" };
  if (savi >= 0.18) return { label:"Dosel abierto",     color:"#f4a261", desc:"Alta interferencia del suelo en lecturas" };
  return { label:"Revisar", color:"#e24b4a", desc:"Posible estrés o falla en establecimiento" };
}

function getPCRisk(ndvi, ndviPrev, anomalias, lluvia) {
  let score = 0, factores = [];
  if (ndvi < (ndviPrev || ndvi) - 0.05) { score += 3; factores.push("Caída NDVI > 0.05 vs período anterior"); }
  if (anomalias > 30) { score += 2; factores.push(`${anomalias} píxeles anómalos intralote`); }
  if (lluvia > 1700)  { score += 2; factores.push("Exceso hídrico (> 1700mm sem.) — favorece PC"); }
  if (ndvi < 0.75)    { score += 2; factores.push("NDVI crítico (< 0.75)"); }
  if (score === 0)    return { nivel:"Bajo",     color:"#52b788", score, factores:["Sin factores de riesgo identificados"] };
  if (score <= 2)     return { nivel:"Moderado", color:"#f4a261", score, factores };
  if (score <= 4)     return { nivel:"Alto",     color:"#e07b39", score, factores };
  return { nivel:"Crítico", color:"#e24b4a", score, factores };
}

function getARRisk(ndvi, edad, lluvia) {
  let score = 0, factores = [];
  if (edad >= 4 && edad <= 12) { score += 1; factores.push("Edad de máxima susceptibilidad (4–12 años)"); }
  if (ndvi < 0.78 && edad >= 4){ score += 2; factores.push("NDVI bajo en palma productiva"); }
  if (lluvia > 1200)            { score += 1; factores.push("Alta humedad favorece vector Rhynchophorus"); }
  if (score === 0) return { nivel:"Bajo",     color:"#52b788", score, factores:["Sin factores de riesgo"] };
  if (score <= 2)  return { nivel:"Moderado", color:"#f4a261", score, factores };
  return { nivel:"Alto", color:"#e24b4a", score, factores };
}

// ============================================================
// SVG COMPONENTS
// ============================================================
function SparkLine({ data, color, width=90, height=32 }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data) - 0.005;
  const max = Math.max(...data) + 0.005;
  const sx = i => (i / (data.length - 1)) * width;
  const sy = v => height - ((v - min) / (max - min)) * height;
  const pts = data.map((v,i) => `${sx(i)},${sy(v)}`);
  const line = `M ${pts.join(" L ")}`;
  const area = `M ${sx(0)},${height} L ${pts.join(" L ")} L ${sx(data.length-1)},${height} Z`;
  return (
    <svg width={width} height={height} style={{display:"block",overflow:"visible"}}>
      <defs>
        <linearGradient id={`sg${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={color} stopOpacity="0.02"/>
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg${color.replace("#","")})`}/>
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
      <circle cx={sx(data.length-1)} cy={sy(data[data.length-1])} r="3" fill={color}/>
    </svg>
  );
}

function HealthBar({ value, min=0.65, max=1.0, width=200, height=12 }) {
  const pct = Math.max(0, Math.min(100, ((value-min)/(max-min))*100));
  const color = value>=0.85?"#1a5c38":value>=0.80?"#52b788":value>=0.72?"#f4a261":"#e24b4a";
  return (
    <svg width={width} height={height+4} style={{display:"block",overflow:"visible"}}>
      <defs>
        <linearGradient id="hbt" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#e24b4a" stopOpacity="0.3"/>
          <stop offset="40%"  stopColor="#f4a261" stopOpacity="0.3"/>
          <stop offset="70%"  stopColor="#52b788" stopOpacity="0.3"/>
          <stop offset="100%" stopColor="#1a5c38" stopOpacity="0.3"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={width} height={height} rx={height/2} fill="url(#hbt)"/>
      <rect x="0" y="0" width={`${pct}%`} height={height} rx={height/2} fill={color} opacity="0.9"/>
      <circle cx={`${pct}%`} cy={height/2} r={height/2+1} fill={color} stroke="#0a120d" strokeWidth="1.5"/>
    </svg>
  );
}

function CircleGauge({ value, min=-0.5, max=0.5, color, size=56 }) {
  const pct  = Math.max(0, Math.min(1, (value-min)/(max-min)));
  const r    = (size-8)/2;
  const circ = 2*Math.PI*r;
  return (
    <svg width={size} height={size} style={{display:"block"}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#ffffff10" strokeWidth="5"/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={`${pct*circ} ${circ}`} strokeDashoffset={circ/4}
        strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}/>
      <text x={size/2} y={size/2+4} textAnchor="middle" fontSize="10" fontFamily="monospace" fill={color} fontWeight="700">
        {value.toFixed(2)}
      </text>
    </svg>
  );
}

// ============================================================
// UI COMPONENTS
// ============================================================
function RiskPanel({ title, risk }) {
  return (
    <div style={{background:"#0a120d",borderRadius:10,padding:"14px 16px",border:`1px solid ${risk.color}30`,borderLeft:`3px solid ${risk.color}`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{fontSize:11,fontWeight:600,color:"#c8e6d8"}}>{title}</div>
        <span style={{background:`${risk.color}20`,color:risk.color,padding:"3px 10px",borderRadius:10,fontSize:10,fontFamily:"monospace",fontWeight:700}}>
          {risk.nivel}
        </span>
      </div>
      <div style={{display:"grid",gap:4}}>
        {risk.factores.map((f,i)=>(
          <div key={i} style={{display:"flex",gap:8,fontSize:10,color:"#8a9e94",lineHeight:1.5}}>
            <span style={{color:risk.nivel==="Bajo"?"#52b788":risk.color,flexShrink:0}}>{risk.nivel==="Bajo"?"✓":"•"}</span>
            <span>{f}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div style={{background:"#0a120d",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <div style={{width:40,height:40,border:"2px solid #1a5c38",borderTop:"2px solid #52b788",borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
      <div style={{fontSize:11,color:"#52b788",fontFamily:"monospace",letterSpacing:".1em"}}>CARGANDO DATOS SATELITALES...</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function DataBadge({ source, time, isLive }) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:6,background:isLive?"#1a5c3820":"#ffffff08",border:`1px solid ${isLive?"#1a5c38":"#ffffff15"}`,borderRadius:6,padding:"4px 10px"}}>
      <div style={{width:6,height:6,borderRadius:"50%",background:isLive?"#52b788":"#556b5e",animation:isLive?"pulse 2s infinite":"none"}}/>
      <span style={{fontSize:9,color:isLive?"#52b788":"#556b5e",fontFamily:"monospace",letterSpacing:".05em"}}>
        {isLive ? "API activa" : "Datos locales"}
      </span>
      {time && <span style={{fontSize:9,color:"#556b5e",fontFamily:"monospace"}}>{time}</span>}
    </div>
  );
}

// ============================================================
// APP PRINCIPAL
// ============================================================
const PERIODOS = ["2023-S1","2023-S2","2024-S1","2024-S2","2025-S1","2025-S2"];

export default function App() {
  const [finca,      setFinca]      = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [dataSource, setDataSource] = useState("loading"); // "api" | "fallback"
  const [lastUpdate, setLastUpdate] = useState(null);
  const [activeLote, setActiveLote] = useState(null);
  const [activeTab,  setActiveTab]  = useState("indices");

  // ---- Fetch ----
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (!GAS_URL || GAS_URL === "TU_APPS_SCRIPT_URL_AQUI") throw new Error("URL no configurada");
      const res  = await fetch(GAS_URL);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Error en API");
      setFinca(json.data);
      setActiveLote(json.data.lotes[0]);
      setDataSource("api");
      setLastUpdate(new Date(json.data.ultimaActualizacion).toLocaleTimeString("es-CO"));
    } catch (err) {
      console.warn("PalmaSat API:", err.message, "— usando fallback");
      setFinca(FINCA_FALLBACK);
      setActiveLote(FINCA_FALLBACK.lotes[0]);
      setDataSource("fallback");
      setLastUpdate(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ---- Guarda lote activo sincronizado cuando finca cambia ----
  useEffect(() => {
    if (finca && activeLote) {
      const updated = finca.lotes.find(l => l.id === activeLote.id);
      if (updated) setActiveLote(updated);
    }
  }, [finca]);

  if (loading) return <LoadingScreen/>;

  const pcRisk  = getPCRisk(activeLote.ndvi, activeLote.ndviPrev, activeLote.anomalias, finca.lluvia);
  const arRisk  = getARRisk(activeLote.ndvi, activeLote.edad, finca.lluvia);
  const ndviSt  = getNDVIStatus(activeLote.ndvi, activeLote.edad);
  const ndwiSt  = getNDWIStatus(activeLote.ndwi);
  const saviSt  = activeLote.savi ? getSAVIStatus(activeLote.savi, activeLote.edad) : null;
  const ndviDelta = activeLote.ndviPrev ? ((activeLote.ndvi - activeLote.ndviPrev) * 100).toFixed(1) : null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#1a5c38;border-radius:2px}
        @keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .lote-tab{background:none;border:none;cursor:pointer;padding:8px 14px;font-family:'DM Mono',monospace;font-size:11px;color:#556b5e;border-radius:8px;transition:all .2s;text-transform:uppercase;letter-spacing:.08em}
        .lote-tab.active{background:#1a5c3825;color:#52b788;border:1px solid #1a5c3850}
        .lote-tab:hover{color:#81c995}
        .nav-tab{background:none;border:none;cursor:pointer;padding:6px 16px;font-family:'DM Mono',monospace;font-size:10px;color:#556b5e;border-bottom:2px solid transparent;transition:all .2s;text-transform:uppercase;letter-spacing:.1em}
        .nav-tab.active{color:#52b788;border-bottom-color:#52b788}
        .nav-tab:hover{color:#81c995}
        .refresh-btn{background:none;border:1px solid #1a5c3840;color:#52b78880;padding:4px 10px;border-radius:6px;font-family:'DM Mono',monospace;font-size:9px;cursor:pointer;transition:all .2s;letter-spacing:.08em}
        .refresh-btn:hover{border-color:#52b788;color:#52b788}
      `}</style>

      <div style={{background:"#0a120d",minHeight:"100vh",color:"#c8e6d8",fontFamily:"'DM Mono',monospace"}}>

        {/* HEADER */}
        <div style={{background:"#0d1a11",borderBottom:"1px solid #ffffff08",padding:"10px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:30,height:30,background:"#1a5c38",borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <div style={{width:12,height:12,border:"2px solid #81c995",borderRadius:3}}/>
            </div>
            <div>
              <div style={{fontSize:13,fontWeight:700,fontFamily:"'Syne',sans-serif",color:"#e8f4f0"}}>
                PalmaSat <span style={{color:"#52b788",fontSize:10}}>v3.0</span>
              </div>
              <div style={{fontSize:9,color:"#52b788",letterSpacing:".12em",textTransform:"uppercase"}}>
                NDVI · NDWI · SAVI · Protocolos PC
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <div style={{textAlign:"right",fontSize:10}}>
              <div style={{color:"#52b788",fontFamily:"monospace"}}>Sentinel-2 · {finca.fechaImagen}</div>
              <div style={{color:"#556b5e"}}>Nubosidad: {finca.nubosidad}</div>
            </div>
            <DataBadge source={dataSource} time={lastUpdate} isLive={dataSource==="api"}/>
            <button className="refresh-btn" onClick={fetchData}>↺ SYNC</button>
          </div>
        </div>

        {/* Banner fallback */}
        {dataSource === "fallback" && (
          <div style={{background:"#1a0a00",borderBottom:"1px solid #f4a26130",padding:"6px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:10,color:"#f4a261"}}>
              ⚠ API no disponible — mostrando datos hardcodeados.{" "}
              {GAS_URL==="TU_APPS_SCRIPT_URL_AQUI" ? "Configura GAS_URL en el código." : "Verifica que el Apps Script esté desplegado."}
            </span>
            <button className="refresh-btn" style={{borderColor:"#f4a26140",color:"#f4a26180"}} onClick={fetchData}>Reintentar</button>
          </div>
        )}

        {/* FINCA HEADER */}
        <div style={{padding:"16px 20px 0",borderBottom:"1px solid #ffffff06"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14,flexWrap:"wrap",gap:10}}>
            <div>
              <div style={{fontSize:9,color:"#52b788",textTransform:"uppercase",letterSpacing:".15em",marginBottom:4}}>Finca activa</div>
              <h1 style={{fontSize:24,fontFamily:"'Syne',sans-serif",fontWeight:800,color:"#e8f4f0",letterSpacing:"-.01em"}}>{finca.nombre}</h1>
              <div style={{fontSize:11,color:"#556b5e",marginTop:2}}>{finca.propietario} · {finca.municipio} · {finca.area}</div>
            </div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              {[
                { label:"NDVI prom.", val:(finca.lotes.reduce((a,l)=>a+l.ndvi,0)/finca.lotes.length).toFixed(4), color:"#52b788" },
                { label:"Anomalías",  val:finca.anomalias, color:finca.anomalias>40?"#e24b4a":"#f4a261" },
                { label:"Lluvia",     val:`${finca.lluvia}mm`, color:finca.lluvia<400?"#f4a261":"#52b788" },
              ].map((m,i)=>(
                <div key={i} style={{background:"#111a16",border:"1px solid #ffffff08",borderRadius:8,padding:"8px 14px",textAlign:"right"}}>
                  <div style={{fontSize:16,fontWeight:700,color:m.color,fontFamily:"monospace"}}>{m.val}</div>
                  <div style={{fontSize:9,color:"#556b5e",textTransform:"uppercase",letterSpacing:".08em"}}>{m.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Selector de lotes */}
          <div style={{display:"flex",gap:6,paddingBottom:0}}>
            {finca.lotes.map(l => {
              const st = getNDVIStatus(l.ndvi, l.edad);
              return (
                <button key={l.id} className={`lote-tab ${activeLote.id===l.id?"active":""}`}
                  onClick={()=>{ setActiveLote(l); setActiveTab("indices"); }}>
                  <span style={{display:"inline-block",width:6,height:6,borderRadius:"50%",background:st.color,marginRight:4,verticalAlign:"middle"}}/>
                  {l.id}
                  <span style={{color:"#8a9e94",fontSize:9,marginLeft:4}}>{l.edad}a</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* LOTE DETALLE */}
        <div style={{padding:"20px",animation:"fadeUp .3s ease"}} key={activeLote.id}>

          {/* Info lote */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:20}}>
            <div style={{background:"#111a16",border:"1px solid #ffffff08",borderRadius:10,padding:"14px 16px"}}>
              <div style={{fontSize:9,color:"#52b788",textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>Identificación</div>
              <div style={{fontSize:16,fontWeight:700,color:"#e8f4f0",fontFamily:"'Syne',sans-serif",marginBottom:4}}>{activeLote.id} · {activeLote.material}</div>
              <div style={{fontSize:10,color:"#556b5e"}}>Siembra: {activeLote.siembra} · {activeLote.edad} años</div>
              <div style={{fontSize:10,color:"#556b5e",marginTop:2}}>
                {activeLote.edad<=3?"Etapa: Establecimiento":activeLote.edad<=7?"Etapa: Inicio producción":"Etapa: Producción plena"}
              </div>
            </div>
            <div style={{background:"#111a16",border:"1px solid #ffffff08",borderRadius:10,padding:"14px 16px"}}>
              <div style={{fontSize:9,color:"#52b788",textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>NDVI · Vigor vegetativo</div>
              <div style={{fontSize:22,fontWeight:700,color:ndviSt.color,fontFamily:"monospace",marginBottom:6}}>{activeLote.ndvi.toFixed(4)}</div>
              <HealthBar value={activeLote.ndvi} min={0.65} max={1.0} width={180} height={8}/>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
                <span style={{background:ndviSt.bg,color:ndviSt.color,padding:"2px 8px",borderRadius:8,fontSize:10}}>{ndviSt.label}</span>
                {ndviDelta && (
                  <span style={{fontSize:10,color:parseFloat(ndviDelta)>=0?"#52b788":"#e24b4a",fontFamily:"monospace"}}>
                    {parseFloat(ndviDelta)>=0?"+":""}{ndviDelta}% vs prev
                  </span>
                )}
              </div>
            </div>
            <div style={{background:"#111a16",border:"1px solid #ffffff08",borderRadius:10,padding:"14px 16px"}}>
              <div style={{fontSize:9,color:"#52b788",textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>Tendencia semestral</div>
              <SparkLine data={activeLote.tendencia} color={ndviSt.color} width={160} height={44}/>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#556b5e",marginTop:4}}>
                <span>{PERIODOS[0]}</span><span>{PERIODOS[PERIODOS.length-1]}</span>
              </div>
            </div>
          </div>

          {/* Nav tabs */}
          <div style={{display:"flex",gap:0,borderBottom:"1px solid #ffffff08",marginBottom:18}}>
            {[["indices","Índices"],["protocolos","Protocolos PC/AR"],["campo","Campo GPS"]].map(([k,v])=>(
              <button key={k} className={`nav-tab ${activeTab===k?"active":""}`} onClick={()=>setActiveTab(k)}>{v}</button>
            ))}
          </div>

          {/* TAB: ÍNDICES */}
          {activeTab==="indices" && (
            <div style={{animation:"fadeUp .2s ease"}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:18}}>

                {/* NDWI */}
                <div style={{background:"#111a16",border:"1px solid #ffffff08",borderRadius:10,padding:"16px"}}>
                  <div style={{fontSize:9,color:"#52b788",textTransform:"uppercase",letterSpacing:".1em",marginBottom:10}}>NDWI · Estrés hídrico</div>
                  <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
                    <CircleGauge value={activeLote.ndwi} min={-0.5} max={0.5} color={ndwiSt.color} size={58}/>
                    <div>
                      <div style={{fontSize:13,fontWeight:600,color:ndwiSt.color,marginBottom:3}}>{ndwiSt.label}</div>
                      <div style={{fontSize:10,color:"#556b5e",lineHeight:1.5}}>{ndwiSt.desc}</div>
                    </div>
                  </div>
                  <div style={{fontSize:9,color:"#556b5e",borderTop:"1px solid #ffffff06",paddingTop:8}}>
                    NIR (B8) − SWIR (B11) · Umbral crítico: &lt; −0.15
                  </div>
                </div>

                {/* SAVI / EVI */}
                <div style={{background:"#111a16",border:"1px solid #ffffff08",borderRadius:10,padding:"16px"}}>
                  {saviSt ? (
                    <>
                      <div style={{fontSize:9,color:"#f4a261",textTransform:"uppercase",letterSpacing:".1em",marginBottom:10}}>SAVI · Corrección suelo</div>
                      <div style={{fontSize:22,fontWeight:700,color:saviSt.color,fontFamily:"monospace",marginBottom:6}}>{activeLote.savi.toFixed(4)}</div>
                      <HealthBar value={activeLote.savi} min={0.1} max={0.7} width={160} height={8}/>
                      <div style={{marginTop:8}}>
                        <span style={{background:`${saviSt.color}20`,color:saviSt.color,padding:"2px 8px",borderRadius:8,fontSize:10}}>{saviSt.label}</span>
                        <div style={{fontSize:10,color:"#556b5e",marginTop:6,lineHeight:1.5}}>{saviSt.desc}</div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{fontSize:9,color:"#52b788",textTransform:"uppercase",letterSpacing:".1em",marginBottom:10}}>EVI · Índice mejorado</div>
                      <div style={{fontSize:22,fontWeight:700,color:"#52b788",fontFamily:"monospace",marginBottom:6}}>{activeLote.evi.toFixed(4)}</div>
                      <HealthBar value={activeLote.evi} min={0.2} max={0.9} width={160} height={8}/>
                      <div style={{fontSize:10,color:"#556b5e",marginTop:8,lineHeight:1.5}}>
                        {activeLote.evi>=0.55?"Biomasa alta — complementa NDVI en zona densa":"Biomasa moderada — revisar con NDVI"}
                      </div>
                    </>
                  )}
                </div>

                {/* Panel de índices */}
                <div style={{background:"#111a16",border:"1px solid #ffffff08",borderRadius:10,padding:"16px"}}>
                  <div style={{fontSize:9,color:"#52b788",textTransform:"uppercase",letterSpacing:".1em",marginBottom:10}}>Panel de índices</div>
                  <div style={{display:"grid",gap:8}}>
                    {[
                      { label:"NDVI", val:activeLote.ndvi,  ref:"0.65–1.00", ok:activeLote.ndvi>=0.80 },
                      { label:"NDWI", val:activeLote.ndwi,  ref:"−0.05 a +1",ok:activeLote.ndwi>=-0.05 },
                      { label:"EVI",  val:activeLote.evi,   ref:"0.20–0.90", ok:activeLote.evi>=0.45 },
                      ...(activeLote.savi?[{ label:"SAVI", val:activeLote.savi, ref:"0.18–0.70", ok:activeLote.savi>=0.30 }]:[]),
                    ].map((idx,i)=>(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:"1px solid #ffffff06"}}>
                        <div>
                          <span style={{fontSize:11,fontWeight:600,color:"#c8e6d8",fontFamily:"monospace"}}>{idx.label}</span>
                          <span style={{fontSize:9,color:"#556b5e",marginLeft:8}}>{idx.ref}</span>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontSize:12,fontFamily:"monospace",color:idx.ok?"#52b788":"#f4a261",fontWeight:600}}>{idx.val.toFixed(4)}</span>
                          <span style={{fontSize:10,color:idx.ok?"#1a5c38":"#f4a261"}}>{idx.ok?"✓":"⚠"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Interpretación integrada */}
              <div style={{background:"#111a16",border:"1px solid #1a5c3830",borderRadius:10,padding:"14px 18px"}}>
                <div style={{fontSize:9,color:"#52b788",textTransform:"uppercase",letterSpacing:".1em",marginBottom:10}}>
                  Interpretación integrada · {activeLote.id} · {activeLote.material}
                </div>
                <div style={{fontSize:12,color:"#c8e6d8",lineHeight:1.8}}>
                  {activeLote.edad<=3 ? (
                    <>NDVI de {activeLote.ndvi.toFixed(4)} es normal para palma de {activeLote.edad} años con dosel en desarrollo. El SAVI ({activeLote.savi?.toFixed(4)}) confirma interferencia moderada del suelo. NDWI de {activeLote.ndwi.toFixed(4)}: {ndwiSt.label.toLowerCase()}.</>
                  ) : (
                    <>NDVI de {activeLote.ndvi.toFixed(4)} ({ndviSt.label}) en palma de {activeLote.edad} años (producción {activeLote.edad<=7?"en inicio":"plena"}). NDWI de {activeLote.ndwi.toFixed(4)} indica {ndwiSt.label.toLowerCase()} — {ndwiSt.desc.toLowerCase()}. EVI de {activeLote.evi.toFixed(4)} confirma la lectura NDVI en zona de alta biomasa.</>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB: PROTOCOLOS */}
          {activeTab==="protocolos" && (
            <div style={{animation:"fadeUp .2s ease"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
                <RiskPanel title="Pudrición del Cogollo (PC)" risk={pcRisk}/>
                <RiskPanel title="Anillo Rojo (Rhynchophorus)" risk={arRisk}/>
              </div>
              <div style={{background:"#111a16",border:"1px solid #ffffff08",borderRadius:10,padding:"16px",marginBottom:14}}>
                <div style={{fontSize:9,color:"#52b788",textTransform:"uppercase",letterSpacing:".1em",marginBottom:12}}>Guía de síntomas en campo · Palma africana</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  {[
                    { title:"Pudrición del Cogollo (PC)",     color:"#e24b4a", sintomas:["Decoloración amarillo-parda en hojas del cogollo","Podredumbre húmeda en base de flechas","Olor fétido característico","Patrón satelital: mancha radial oscura","NDVI caída local > 0.08 en < 60 días"] },
                    { title:"Anillo Rojo (R. palmarum)",       color:"#f4a261", sintomas:["Amarillamiento progresivo de hojas externas","Perforación circular en estipe","Tejido interno con anillo rojizo al corte","NDVI caída gradual sobre 3-4 períodos","Presencia de escarabajos adultos o larvas"] },
                    { title:"Estrés Hídrico (NDWI < -0.10)",  color:"#378add", sintomas:["Cierre de folíolos (posición vertical)","Reducción de emisión de hojas nuevas","Coloración verde-grisácea en follaje","NDWI < -0.15 = revisar riego urgente","Recuperación rápida con lluvia o riego"] },
                    { title:"Deficiencia Nutricional",         color:"#9b59b6", sintomas:["Clorosis intervenal (Mg, Fe, Mn)","Manchas necróticas en folíolos (K, Ca)","Reducción general del NDVI sin patrón focal","EVI bajo con NDVI moderado","Confirmar con muestreo foliar laboratorio"] },
                  ].map((e,i)=>(
                    <div key={i} style={{background:"#0a120d",borderRadius:8,padding:"12px",borderLeft:`2px solid ${e.color}`}}>
                      <div style={{fontSize:11,fontWeight:600,color:e.color,marginBottom:8}}>{e.title}</div>
                      {e.sintomas.map((s,j)=>(
                        <div key={j} style={{fontSize:10,color:"#8a9e94",display:"flex",gap:6,marginBottom:3,lineHeight:1.4}}>
                          <span style={{color:e.color,flexShrink:0}}>→</span><span>{s}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{background:"#111a16",border:"1px solid #ffffff08",borderRadius:10,padding:"16px"}}>
                <div style={{fontSize:9,color:"#52b788",textTransform:"uppercase",letterSpacing:".1em",marginBottom:10}}>Protocolo de acción · {activeLote.id}</div>
                <div style={{display:"grid",gap:6}}>
                  {[
                    { paso:"01", accion:"Verificar imagen satelital — comparar con período anterior en GEE",      urgencia:pcRisk.nivel==="Bajo"?"Rutina":"Urgente" },
                    { paso:"02", accion:"Inspección visual en zonas rojas del mapa GPS de anomalías",              urgencia:pcRisk.nivel==="Bajo"?"Mensual":"Esta semana" },
                    { paso:"03", accion:"Muestreo foliar si NDVI caída > 0.05 — analizar N,P,K,Mg,B,Cu",          urgencia:"Según NDVI" },
                    { paso:"04", accion:"Instalar trampa Metarhizium/feromonas para Rhynchophorus palmarum",       urgencia:arRisk.nivel!=="Bajo"?"Urgente":"Preventivo" },
                    { paso:"05", accion:"Reportar a Cenipalma si se confirma PC — protocolo manejo focal",         urgencia:pcRisk.nivel==="Crítico"?"Inmediato":"Si confirma" },
                  ].map((p,i)=>(
                    <div key={i} style={{display:"flex",gap:12,padding:"8px 10px",background:"#0a120d",borderRadius:8,alignItems:"center"}}>
                      <span style={{fontSize:10,color:"#52b788",fontFamily:"monospace",fontWeight:700,minWidth:24}}>{p.paso}</span>
                      <span style={{fontSize:11,color:"#c8e6d8",flex:1}}>{p.accion}</span>
                      <span style={{fontSize:9,color:p.urgencia.includes("Urgente")||p.urgencia.includes("Inmediato")?"#e24b4a":p.urgencia.includes("Esta")?"#f4a261":"#556b5e",fontFamily:"monospace",whiteSpace:"nowrap"}}>{p.urgencia}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB: CAMPO */}
          {activeTab==="campo" && (
            <div style={{animation:"fadeUp .2s ease"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
                <div style={{background:"#111a16",border:"1px solid #ffffff08",borderRadius:10,padding:"16px"}}>
                  <div style={{fontSize:9,color:"#52b788",textTransform:"uppercase",letterSpacing:".1em",marginBottom:12}}>Coordenadas GPS · Todos los lotes</div>
                  {finca.lotes.map((l,i)=>{
                    const st = getNDVIStatus(l.ndvi, l.edad);
                    return (
                      <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #ffffff06"}}>
                        <div>
                          <span style={{fontSize:11,fontWeight:600,color:"#e8f4f0"}}>{l.id}</span>
                          <span style={{fontSize:10,color:"#556b5e",marginLeft:8}}>{l.material}</span>
                        </div>
                        <div style={{display:"flex",gap:10,alignItems:"center"}}>
                          <span style={{fontSize:11,color:st.color,fontFamily:"monospace"}}>{l.ndvi.toFixed(4)}</span>
                          <a href={`https://maps.google.com/?q=${(finca.lat+i*0.003).toFixed(6)},${(finca.lng+i*0.002).toFixed(6)}`}
                            target="_blank" rel="noreferrer"
                            style={{background:"#1a5c3820",border:"1px solid #1a5c38",color:"#52b788",padding:"3px 10px",borderRadius:6,fontSize:10,textDecoration:"none",fontFamily:"monospace"}}>
                            GPS →
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{background:"#111a16",border:"1px solid #ffffff08",borderRadius:10,padding:"16px"}}>
                  <div style={{fontSize:9,color:"#52b788",textTransform:"uppercase",letterSpacing:".1em",marginBottom:12}}>WhatsApp · Alerta campo</div>
                  <button onClick={()=>{
                    const msg = `🛰️ *PalmaSat v3.0 · ${finca.nombre}*\n${finca.municipio}\n\n📊 *Índices ${activeLote.id} (${activeLote.material}):*\n• NDVI: ${activeLote.ndvi.toFixed(4)} — ${ndviSt.label}\n• NDWI: ${activeLote.ndwi.toFixed(4)} — ${ndwiSt.label}\n• EVI: ${activeLote.evi.toFixed(4)}\n${activeLote.savi?`• SAVI: ${activeLote.savi.toFixed(4)} — ${saviSt?.label}\n`:""}\n⚠️ *Riesgo PC:* ${pcRisk.nivel}\n⚠️ *Riesgo Anillo Rojo:* ${arRisk.nivel}\n\n📍 Ver en campo: maps.google.com/?q=${finca.lat},${finca.lng}\n\n_Sentinel-2 · ${finca.fechaImagen} · Nubosidad: ${finca.nubosidad}_\n_${dataSource==="api"?"Datos en tiempo real":"Datos locales"}_`;
                    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`,"_blank");
                  }} style={{width:"100%",background:"#25D36615",border:"1px solid #25D366",color:"#25D366",borderRadius:8,padding:"11px",fontSize:12,fontFamily:"'DM Mono',monospace",cursor:"pointer",marginBottom:10}}>
                    📱 Enviar reporte a WhatsApp
                  </button>
                  <div style={{fontSize:9,color:"#556b5e",lineHeight:1.6}}>
                    Incluye: NDVI · NDWI · SAVI · Riesgo PC · Riesgo Anillo Rojo · Coordenadas GPS · Fecha imagen
                  </div>
                </div>
              </div>
              <div style={{background:"#0a120d",border:"1px dashed #1a5c38",borderRadius:10,padding:"14px 18px"}}>
                <div style={{fontSize:9,color:"#52b788",textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>Backend GEE v3.0 · Configuración activa</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,fontSize:10,color:"#8a9e94"}}>
                  {["Imagen más reciente con < 20% nubosidad","Fallback automático a 45% si no hay imagen","Máscara nubes píxel a píxel (banda SCL)","NDVI + NDWI + SAVI (L=0.5) + EVI","Umbral anomalías dinámico (µ − 1.5σ)","Exporta CSV + coordenadas GPS anomalías"].map((item,i)=>(
                    <div key={i} style={{display:"flex",gap:6,lineHeight:1.5}}>
                      <span style={{color:"#52b788",flexShrink:0}}>✓</span><span>{item}</span>
                    </div>
                  ))}
                </div>
                <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid #ffffff06",fontSize:10,color:"#556b5e",fontFamily:"monospace"}}>
                  Fuente de datos actual: <span style={{color:dataSource==="api"?"#52b788":"#f4a261"}}>{dataSource==="api"?"Google Sheets (API activa)":"Hardcoded fallback"}</span>
                  {lastUpdate && <span style={{marginLeft:16}}>Última sync: {lastUpdate}</span>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
