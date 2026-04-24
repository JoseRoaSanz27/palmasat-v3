import { useState, useEffect } from "react";

const GAS_URL = "https://script.google.com/macros/s/AKfycbxb1UHEAwSsQSlC8S-QVuQdCTgrJ8SZizhiL4K8W4L2qo0FhRFUpar917HzNeeh7Jil7A/exec";

// Helper seguro para formatear números
const fmt = (v, d = 4) => (typeof v === "number" && !isNaN(v)) ? v.toFixed(d) : "N/A";
const safe = (v, def = 0) => (typeof v === "number" && !isNaN(v)) ? v : def;

function getNDVIStatus(ndvi, edad) {
  ndvi = safe(ndvi);
  if (edad <= 3) {
    if (ndvi >= 0.78) return { label: "Óptimo/edad", color: "#52b788", bg: "#52b78818" };
    if (ndvi >= 0.65) return { label: "Normal/edad", color: "#81c995", bg: "#81c99518" };
    return { label: "Revisar", color: "#f4a261", bg: "#f4a26118" };
  }
  if (edad <= 7) {
    if (ndvi >= 0.82) return { label: "Óptimo", color: "#1a5c38", bg: "#1a5c3818" };
    if (ndvi >= 0.75) return { label: "Saludable", color: "#52b788", bg: "#52b78818" };
    if (ndvi >= 0.65) return { label: "Alerta", color: "#f4a261", bg: "#f4a26118" };
    return { label: "Crítico", color: "#e24b4a", bg: "#e24b4a18" };
  }
  if (ndvi >= 0.85) return { label: "Óptimo", color: "#1a5c38", bg: "#1a5c3818" };
  if (ndvi >= 0.80) return { label: "Saludable", color: "#52b788", bg: "#52b78818" };
  if (ndvi >= 0.72) return { label: "Alerta", color: "#f4a261", bg: "#f4a26118" };
  return { label: "Crítico", color: "#e24b4a", bg: "#e24b4a18" };
}

function getNDWIStatus(ndwi) {
  if (ndwi === null || ndwi === undefined || isNaN(ndwi)) {
    return { label: "Sin datos", color: "#556b5e", desc: "NDWI no disponible" };
  }
  if (ndwi >= 0.1) return { label: "Sin estrés", color: "#52b788", desc: "Balance hídrico óptimo" };
  if (ndwi >= -0.05) return { label: "Leve", color: "#81c995", desc: "Monitorear en temporada seca" };
  if (ndwi >= -0.15) return { label: "Moderado", color: "#f4a261", desc: "Considerar riego" };
  if (ndwi >= -0.25) return { label: "Severo", color: "#e07b39", desc: "Riego urgente" };
  return { label: "Crítico", color: "#e24b4a", desc: "Riesgo permanente" };
}

function getPCRisk(ndvi, ndviPrev, anomalias, lluvia) {
  let score = 0, factores = [];
  const n = safe(ndvi), np = safe(ndviPrev, ndvi), a = safe(anomalias), l = safe(lluvia);
  if (np && n < np - 0.05) { score += 3; factores.push("Caída NDVI > 0.05"); }
  if (a > 30) { score += 2; factores.push(`${a} píxeles anómalos`); }
  if (l > 1700) { score += 2; factores.push("Exceso hídrico"); }
  if (n < 0.75) { score += 2; factores.push("NDVI crítico"); }
  if (score === 0) return { nivel: "Bajo", color: "#52b788", factores: ["Sin factores de riesgo"] };
  if (score <= 2) return { nivel: "Moderado", color: "#f4a261", factores };
  if (score <= 4) return { nivel: "Alto", color: "#e07b39", factores };
  return { nivel: "Crítico", color: "#e24b4a", factores };
}

function getAR_Risk(ndvi, edad, lluvia) {
  let score = 0, factores = [];
  const n = safe(ndvi), l = safe(lluvia);
  if (edad >= 4 && edad <= 12) { score++; factores.push("Edad susceptible"); }
  if (n < 0.78 && edad >= 4) { score += 2; factores.push("NDVI bajo"); }
  if (l > 1200) { score++; factores.push("Alta humedad"); }
  if (score === 0) return { nivel: "Bajo", color: "#52b788", factores: ["Sin factores de riesgo"] };
  if (score <= 2) return { nivel: "Moderado", color: "#f4a261", factores };
  return { nivel: "Alto", color: "#e24b4a", factores };
}

export default function App() {
  const [FINCA, setFINCA] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeLote, setActiveLote] = useState(null);

  useEffect(() => {
    fetch(GAS_URL)
      .then(res => res.json())
      .then(json => {
        if (json.ok && json.data) {
          console.log("Datos recibidos:", json.data);
          setFINCA(json.data);
          if (json.data.lotes && json.data.lotes.length > 0) {
            setActiveLote(json.data.lotes[0]);
          }
        } else {
          setError(json.error || "Error desconocido");
        }
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) return (
    <div style={{ background:"#0a120d", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", color:"#52b788", fontFamily:"system-ui" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:18, marginBottom:10 }}>🛰️ Cargando datos satelitales...</div>
        <div style={{ fontSize:12, color:"#556b5e" }}>Sentinel-2 · Google Earth Engine</div>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ background:"#0a120d", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", color:"#e24b4a", fontFamily:"system-ui", padding:40 }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:18, marginBottom:10 }}>❌ Error al cargar datos</div>
        <div style={{ fontSize:14, color:"#556b5e" }}>{error}</div>
      </div>
    </div>
  );

  if (!FINCA || !activeLote) return (
    <div style={{ background:"#0a120d", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", color:"#f4a261", fontFamily:"system-ui" }}>
      <div>Sin datos disponibles</div>
    </div>
  );

  const pcRisk = getPCRisk(activeLote.ndvi, activeLote.ndviPrev, activeLote.anomalias, FINCA.lluvia);
  const arRisk = getAR_Risk(activeLote.ndvi, activeLote.edad, FINCA.lluvia);
  const ndviSt = getNDVIStatus(activeLote.ndvi, activeLote.edad);
  const ndwiSt = getNDWIStatus(activeLote.ndwi);

  const lotes = FINCA.lotes || [];
  const ndviProm = lotes.length > 0 ? lotes.reduce((a,l)=>a+safe(l.ndvi), 0) / lotes.length : 0;

  return (
    <div style={{ background:"#0a120d", minHeight:"100vh", color:"#c8e6d8", fontFamily:"system-ui, sans-serif", padding:20 }}>
      <div style={{ maxWidth:1200, margin:"0 auto" }}>
        
        <div style={{ background:"#111a16", borderRadius:12, padding:24, marginBottom:20 }}>
          <h1 style={{ margin:0, fontSize:28, color:"#e8f4f0" }}>🛰️ PalmaSat · {FINCA.nombre || "Finca"}</h1>
          <div style={{ marginTop:8, color:"#7f8c8d", fontSize:14 }}>
            {FINCA.municipio} · {FINCA.area} · {FINCA.propietario}
          </div>
          <div style={{ marginTop:16, display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))", gap:16 }}>
            <div>
              <div style={{ fontSize:11, color:"#6c757d", textTransform:"uppercase" }}>Período</div>
              <div style={{ fontSize:15, fontWeight:600, color:"#e8f4f0" }}>{FINCA.periodoActual || FINCA.fechaImagen || "N/A"}</div>
            </div>
            <div>
              <div style={{ fontSize:11, color:"#6c757d", textTransform:"uppercase" }}>NDVI Promedio</div>
              <div style={{ fontSize:15, fontWeight:600, color:"#52b788" }}>{fmt(ndviProm)}</div>
            </div>
            <div>
              <div style={{ fontSize:11, color:"#6c757d", textTransform:"uppercase" }}>Precipitación</div>
              <div style={{ fontSize:15, fontWeight:600, color:"#e8f4f0" }}>{FINCA.lluvia || 0} mm</div>
            </div>
            <div>
              <div style={{ fontSize:11, color:"#6c757d", textTransform:"uppercase" }}>Nubosidad</div>
              <div style={{ fontSize:15, fontWeight:600, color:"#e8f4f0" }}>{FINCA.nubosidad || "N/A"}</div>
            </div>
            <div>
              <div style={{ fontSize:11, color:"#6c757d", textTransform:"uppercase" }}>Anomalías</div>
              <div style={{ fontSize:15, fontWeight:600, color: (FINCA.anomaliasCriticas || 0) > 0 ? "#e24b4a" : "#27ae60" }}>
                {FINCA.anomalias || 0} px
              </div>
            </div>
          </div>
        </div>

        <div style={{ display:"flex", gap:12, marginBottom:20, flexWrap:"wrap" }}>
          {lotes.map(l => {
            const st = getNDVIStatus(l.ndvi, l.edad);
            return (
              <button key={l.id} onClick={() => setActiveLote(l)}
                style={{
                  background: activeLote.id === l.id ? "#1a5c3825" : "#111a16",
                  border: activeLote.id === l.id ? "1px solid #1a5c3850" : "1px solid #ffffff08",
                  color: activeLote.id === l.id ? "#52b788" : "#556b5e",
                  padding:"12px 20px", borderRadius:8, cursor:"pointer", fontSize:14, fontFamily:"inherit"
                }}>
                <span style={{ display:"inline-block", width:8, height:8, borderRadius:"50%", background:st.color, marginRight:8 }} />
                {l.id} · {l.edad}a
              </button>
            );
          })}
        </div>

        <div style={{ background:"#111a16", borderRadius:12, padding:24 }}>
          <h2 style={{ margin:"0 0 16px", fontSize:22, color:"#e8f4f0" }}>
            {activeLote.id} · {activeLote.material} ({activeLote.edad} años)
          </h2>
          <div style={{ fontSize:12, color:"#556b5e", marginBottom:20 }}>
            Siembra: {activeLote.siembra} · {activeLote.edad <= 3 ? "Etapa: Establecimiento" : activeLote.edad <= 7 ? "Etapa: Inicio producción" : "Etapa: Producción plena"}
          </div>
          
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))", gap:16, marginBottom:24 }}>
            <div style={{ background:"#0a120d", padding:16, borderRadius:8 }}>
              <div style={{ fontSize:11, color:"#52b788", textTransform:"uppercase", marginBottom:8 }}>NDVI</div>
              <div style={{ fontSize:28, fontWeight:700, color:ndviSt.color, fontFamily:"monospace" }}>
                {fmt(activeLote.ndvi)}
              </div>
              <div style={{ fontSize:12, color:ndviSt.color, marginTop:8 }}>{ndviSt.label}</div>
            </div>
            
            <div style={{ background:"#0a120d", padding:16, borderRadius:8 }}>
              <div style={{ fontSize:11, color:"#52b788", textTransform:"uppercase", marginBottom:8 }}>NDWI</div>
              <div style={{ fontSize:28, fontWeight:700, color:ndwiSt.color, fontFamily:"monospace" }}>
                {fmt(activeLote.ndwi)}
              </div>
              <div style={{ fontSize:12, color:ndwiSt.color, marginTop:8 }}>{ndwiSt.label}</div>
            </div>

            <div style={{ background:"#0a120d", padding:16, borderRadius:8 }}>
              <div style={{ fontSize:11, color:"#52b788", textTransform:"uppercase", marginBottom:8 }}>EVI</div>
              <div style={{ fontSize:28, fontWeight:700, color:"#52b788", fontFamily:"monospace" }}>
                {fmt(activeLote.evi)}
              </div>
            </div>

            {activeLote.savi != null && (
              <div style={{ background:"#0a120d", padding:16, borderRadius:8 }}>
                <div style={{ fontSize:11, color:"#f4a261", textTransform:"uppercase", marginBottom:8 }}>SAVI</div>
                <div style={{ fontSize:28, fontWeight:700, color:"#f4a261", fontFamily:"monospace" }}>
                  {fmt(activeLote.savi)}
                </div>
              </div>
            )}
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(300px, 1fr))", gap:16 }}>
            <div style={{ background:"#0a120d", padding:16, borderRadius:8, borderLeft:`3px solid ${pcRisk.color}` }}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:8, color:"#c8e6d8" }}>Pudrición del Cogollo (PC)</div>
              <div style={{ fontSize:18, fontWeight:700, color:pcRisk.color, marginBottom:12 }}>{pcRisk.nivel}</div>
              {pcRisk.factores.map((f, i) => (
                <div key={i} style={{ fontSize:12, color:"#8a9e94", marginTop:4 }}>• {f}</div>
              ))}
            </div>

            <div style={{ background:"#0a120d", padding:16, borderRadius:8, borderLeft:`3px solid ${arRisk.color}` }}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:8, color:"#c8e6d8" }}>Anillo Rojo</div>
              <div style={{ fontSize:18, fontWeight:700, color:arRisk.color, marginBottom:12 }}>{arRisk.nivel}</div>
              {arRisk.factores.map((f, i) => (
                <div key={i} style={{ fontSize:12, color:"#8a9e94", marginTop:4 }}>• {f}</div>
              ))}
            </div>
          </div>

          <button onClick={() => {
            const msg = `🛰️ PalmaSat · ${FINCA.nombre}\n\n${activeLote.id} (${activeLote.material}):\nNDVI: ${fmt(activeLote.ndvi)} — ${ndviSt.label}\nNDWI: ${fmt(activeLote.ndwi)} — ${ndwiSt.label}\n\nRiesgo PC: ${pcRisk.nivel}\nRiesgo AR: ${arRisk.nivel}\n\n📍 ${FINCA.lat}, ${FINCA.lng}`;
            window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
          }} style={{
            marginTop:20, width:"100%", background:"#25D36615", border:"1px solid #25D366", 
            color:"#25D366", borderRadius:8, padding:12, fontSize:14, cursor:"pointer", fontFamily:"inherit"
          }}>
            📱 Enviar reporte WhatsApp
          </button>
        </div>

        <div style={{ marginTop:20, textAlign:"center", fontSize:11, color:"#556b5e" }}>
          {FINCA.ultimaActualizacion ? `Última actualización: ${new Date(FINCA.ultimaActualizacion).toLocaleString("es-CO")}` : ""}
        </div>
      </div>
    </div>
  );
}
