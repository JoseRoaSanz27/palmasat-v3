import { useState, useEffect } from "react";

const GAS_URL = "https://script.google.com/macros/s/AKfycbxb1UHEAwSsQSlC8S-QVuQdCTgrJ8SZizhiL4K8W4L2qo0FhRFUpar917HzNeeh7Jil7A/exec";

// Funciones de clasificación
function getNDVIStatus(ndvi, edad) {
  if (edad <= 3) {
    if (ndvi >= 0.78) return { label: "Óptimo/edad", color: "#52b788", bg: "#52b78818", nivel: 1 };
    if (ndvi >= 0.65) return { label: "Normal/edad", color: "#81c995", bg: "#81c99518", nivel: 2 };
    return { label: "Revisar", color: "#f4a261", bg: "#f4a26118", nivel: 3 };
  }
  if (edad <= 7) {
    if (ndvi >= 0.82) return { label: "Óptimo", color: "#1a5c38", bg: "#1a5c3818", nivel: 1 };
    if (ndvi >= 0.75) return { label: "Saludable", color: "#52b788", bg: "#52b78818", nivel: 2 };
    if (ndvi >= 0.65) return { label: "Alerta", color: "#f4a261", bg: "#f4a26118", nivel: 3 };
    return { label: "Crítico", color: "#e24b4a", bg: "#e24b4a18", nivel: 4 };
  }
  if (ndvi >= 0.85) return { label: "Óptimo", color: "#1a5c38", bg: "#1a5c3818", nivel: 1 };
  if (ndvi >= 0.80) return { label: "Saludable", color: "#52b788", bg: "#52b78818", nivel: 2 };
  if (ndvi >= 0.72) return { label: "Alerta", color: "#f4a261", bg: "#f4a26118", nivel: 3 };
  return { label: "Crítico", color: "#e24b4a", bg: "#e24b4a18", nivel: 4 };
}

function getNDWIStatus(ndwi) {
  if (ndwi >= 0.1) return { label: "Sin estrés", color: "#52b788", desc: "Balance hídrico óptimo" };
  if (ndwi >= -0.05) return { label: "Leve", color: "#81c995", desc: "Monitorear en temporada seca" };
  if (ndwi >= -0.15) return { label: "Moderado", color: "#f4a261", desc: "Considerar riego suplementario" };
  if (ndwi >= -0.25) return { label: "Severo", color: "#e07b39", desc: "Riego urgente recomendado" };
  return { label: "Crítico", color: "#e24b4a", desc: "Riesgo de daño permanente en raíces" };
}

function getSAVIStatus(savi, edad) {
  if (edad > 4) return null;
  if (savi >= 0.45) return { label: "Dosel cerrando", color: "#52b788", desc: "Cobertura vegetal adecuada" };
  if (savi >= 0.30) return { label: "Desarrollo normal", color: "#81c995", desc: "Interferencia moderada" };
  if (savi >= 0.18) return { label: "Dosel abierto", color: "#f4a261", desc: "Alta interferencia del suelo" };
  return { label: "Revisar", color: "#e24b4a", desc: "Posible estrés" };
}

function getPCRisk(ndvi, ndviPrev, anomalias, lluvia) {
  let score = 0, factores = [];
  if (ndvi < ndviPrev - 0.05) { score += 3; factores.push("Caída NDVI > 0.05"); }
  if (anomalias > 30) { score += 2; factores.push(`${anomalias} píxeles anómalos`); }
  if (lluvia > 1700) { score += 2; factores.push("Exceso hídrico"); }
  if (ndvi < 0.75) { score += 2; factores.push("NDVI crítico"); }
  if (score === 0) return { nivel: "Bajo", color: "#52b788", factores: ["Sin factores de riesgo"] };
  if (score <= 2) return { nivel: "Moderado", color: "#f4a261", factores };
  if (score <= 4) return { nivel: "Alto", color: "#e07b39", factores };
  return { nivel: "Crítico", color: "#e24b4a", factores };
}

function getAR_Risk(ndvi, edad, lluvia) {
  let score = 0, factores = [];
  if (edad >= 4 && edad <= 12) { score++; factores.push("Edad susceptible"); }
  if (ndvi < 0.78 && edad >= 4) { score += 2; factores.push("NDVI bajo"); }
  if (lluvia > 1200) { score++; factores.push("Alta humedad"); }
  if (score === 0) return { nivel: "Bajo", color: "#52b788", factores: ["Sin factores de riesgo"] };
  if (score <= 2) return { nivel: "Moderado", color: "#f4a261", factores };
  return { nivel: "Alto", color: "#e24b4a", factores };
}

const PERIODOS = ["2023-S1","2023-S2","2024-S1","2024-S2","2025-S1","2025-S2"];

export default function App() {
  const [FINCA, setFINCA] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeLote, setActiveLote] = useState(null);
  const [activeTab, setActiveTab] = useState("indices");

  useEffect(() => {
    fetch(GAS_URL)
      .then(res => res.json())
      .then(json => {
        if (json.ok && json.data) {
          setFINCA(json.data);
          setActiveLote(json.data.lotes[0]);
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
    <div style={{ background:"#0a120d", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Mono',monospace" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:18, color:"#52b788", marginBottom:10 }}>🛰️ Cargando datos satelitales...</div>
        <div style={{ fontSize:12, color:"#556b5e" }}>Sentinel-2 · Google Earth Engine</div>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ background:"#0a120d", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Mono',monospace" }}>
      <div style={{ textAlign:"center", padding:40 }}>
        <div style={{ fontSize:18, color:"#e24b4a", marginBottom:10 }}>❌ Error al cargar datos</div>
        <div style={{ fontSize:14, color:"#556b5e" }}>{error}</div>
        <div style={{ fontSize:12, color:"#556b5e", marginTop:20 }}>Verifica que la API de Apps Script esté activa</div>
      </div>
    </div>
  );

  if (!FINCA || !activeLote) return null;

  const pcRisk = getPCRisk(activeLote.ndvi, activeLote.ndviPrev, activeLote.anomalias, FINCA.lluvia);
  const arRisk = getAR_Risk(activeLote.ndvi, activeLote.edad, FINCA.lluvia);
  const ndviSt = getNDVIStatus(activeLote.ndvi, activeLote.edad);
  const ndwiSt = getNDWIStatus(activeLote.ndwi);
  const saviSt = activeLote.savi ? getSAVIStatus(activeLote.savi, activeLote.edad) : null;

  return (
    <div style={{ background:"#0a120d", minHeight:"100vh", color:"#c8e6d8", fontFamily:"system-ui, sans-serif", padding:20 }}>
      <div style={{ maxWidth:1200, margin:"0 auto" }}>
        
        {/* Header */}
        <div style={{ background:"#111a16", borderRadius:12, padding:24, marginBottom:20 }}>
          <h1 style={{ margin:0, fontSize:28, color:"#e8f4f0" }}>🛰️ PalmaSat · {FINCA.nombre}</h1>
          <div style={{ marginTop:8, color:"#7f8c8d", fontSize:14 }}>{FINCA.municipio} · {FINCA.area} · {FINCA.propietario}</div>
          <div style={{ marginTop:16, display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))", gap:16 }}>
            <div>
              <div style={{ fontSize:12, color:"#6c757d" }}>Período</div>
              <div style={{ fontSize:16, fontWeight:600, color:"#2c3e50" }}>{FINCA.periodoActual || FINCA.fechaImagen}</div>
            </div>
            <div>
              <div style={{ fontSize:12, color:"#6c757d" }}>Precipitación</div>
              <div style={{ fontSize:16, fontWeight:600, color:"#2c3e50" }}>{FINCA.lluvia} mm</div>
            </div>
            <div>
              <div style={{ fontSize:12, color:"#6c757d" }}>Nubosidad</div>
              <div style={{ fontSize:16, fontWeight:600, color:"#2c3e50" }}>{FINCA.nubosidad}</div>
            </div>
            <div>
              <div style={{ fontSize:12, color:"#6c757d" }}>Anomalías</div>
              <div style={{ fontSize:16, fontWeight:600, color:FINCA.anomaliasCriticas > 0 ? "#e74c3c" : "#27ae60" }}>
                {FINCA.anomalias} píxeles
              </div>
            </div>
          </div>
        </div>

        {/* Selector Lotes */}
        <div style={{ display:"flex", gap:12, marginBottom:20, flexWrap:"wrap" }}>
          {FINCA.lotes.map(l => {
            const st = getNDVIStatus(l.ndvi, l.edad);
            return (
              <button key={l.id} onClick={() => { setActiveLote(l); setActiveTab("indices"); }}
                style={{
                  background: activeLote.id === l.id ? "#1a5c3825" : "#111a16",
                  border: activeLote.id === l.id ? "1px solid #1a5c3850" : "1px solid #ffffff08",
                  color: activeLote.id === l.id ? "#52b788" : "#556b5e",
                  padding:"12px 20px", borderRadius:8, cursor:"pointer", fontSize:14
                }}>
                <span style={{ display:"inline-block", width:8, height:8, borderRadius:"50%", background:st.color, marginRight:8 }} />
                {l.id} · {l.edad}a
              </button>
            );
          })}
        </div>

        {/* Lote Detail */}
        <div style={{ background:"#111a16", borderRadius:12, padding:24 }}>
          <h2 style={{ margin:"0 0 16px", fontSize:22, color:"#e8f4f0" }}>
            {activeLote.id} · {activeLote.material} ({activeLote.edad} años)
          </h2>
          
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(250px, 1fr))", gap:16, marginBottom:24 }}>
            <div style={{ background:"#0a120d", padding:16, borderRadius:8 }}>
              <div style={{ fontSize:12, color:"#52b788", marginBottom:8 }}>NDVI</div>
              <div style={{ fontSize:28, fontWeight:700, color:ndviSt.color, fontFamily:"monospace" }}>
                {activeLote.ndvi.toFixed(4)}
              </div>
              <div style={{ fontSize:12, color:ndviSt.color, marginTop:8 }}>{ndviSt.label}</div>
            </div>
            
            <div style={{ background:"#0a120d", padding:16, borderRadius:8 }}>
              <div style={{ fontSize:12, color:"#52b788", marginBottom:8 }}>NDWI</div>
              <div style={{ fontSize:28, fontWeight:700, color:ndwiSt.color, fontFamily:"monospace" }}>
                {activeLote.ndwi.toFixed(4)}
              </div>
              <div style={{ fontSize:12, color:ndwiSt.color, marginTop:8 }}>{ndwiSt.label}</div>
            </div>

            <div style={{ background:"#0a120d", padding:16, borderRadius:8 }}>
              <div style={{ fontSize:12, color:"#52b788", marginBottom:8 }}>EVI</div>
              <div style={{ fontSize:28, fontWeight:700, color:"#52b788", fontFamily:"monospace" }}>
                {activeLote.evi.toFixed(4)}
              </div>
            </div>

            {activeLote.savi && (
              <div style={{ background:"#0a120d", padding:16, borderRadius:8 }}>
                <div style={{ fontSize:12, color:"#f4a261", marginBottom:8 }}>SAVI</div>
                <div style={{ fontSize:28, fontWeight:700, color:saviSt.color, fontFamily:"monospace" }}>
                  {activeLote.savi.toFixed(4)}
                </div>
                <div style={{ fontSize:12, color:saviSt.color, marginTop:8 }}>{saviSt.label}</div>
              </div>
            )}
          </div>

          {/* Riesgos */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginTop:24 }}>
            <div style={{ background:"#0a120d", padding:16, borderRadius:8, borderLeft:`3px solid ${pcRisk.color}` }}>
              <div style={{ fontSize:14, fontWeight:600, marginBottom:12, color:"#c8e6d8" }}>Pudrición del Cogollo (PC)</div>
              <div style={{ fontSize:18, fontWeight:700, color:pcRisk.color, marginBottom:8 }}>{pcRisk.nivel}</div>
              {pcRisk.factores.map((f, i) => (
                <div key={i} style={{ fontSize:12, color:"#8a9e94", marginTop:4 }}>• {f}</div>
              ))}
            </div>

            <div style={{ background:"#0a120d", padding:16, borderRadius:8, borderLeft:`3px solid ${arRisk.color}` }}>
              <div style={{ fontSize:14, fontWeight:600, marginBottom:12, color:"#c8e6d8" }}>Anillo Rojo</div>
              <div style={{ fontSize:18, fontWeight:700, color:arRisk.color, marginBottom:8 }}>{arRisk.nivel}</div>
              {arRisk.factores.map((f, i) => (
                <div key={i} style={{ fontSize:12, color:"#8a9e94", marginTop:4 }}>• {f}</div>
              ))}
            </div>
          </div>

          {/* WhatsApp */}
          <button onClick={() => {
            const msg = `🛰️ PalmaSat · ${FINCA.nombre}\n\n${activeLote.id} (${activeLote.material}):\nNDVI: ${activeLote.ndvi.toFixed(4)} — ${ndviSt.label}\nNDWI: ${activeLote.ndwi.toFixed(4)} — ${ndwiSt.label}\n\nRiesgo PC: ${pcRisk.nivel}\nRiesgo AR: ${arRisk.nivel}\n\n📍 ${FINCA.lat}, ${FINCA.lng}`;
            window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
          }} style={{
            marginTop:24, width:"100%", background:"#25D36615", border:"1px solid #25D366", 
            color:"#25D366", borderRadius:8, padding:12, fontSize:14, cursor:"pointer"
          }}>
            📱 Enviar reporte WhatsApp
          </button>
        </div>

        {/* Footer */}
        <div style={{ marginTop:20, textAlign:"center", fontSize:12, color:"#6c757d" }}>
          Última actualización: {new Date(FINCA.ultimaActualizacion).toLocaleString("es-CO")}
        </div>
      </div>
    </div>
  );
}
