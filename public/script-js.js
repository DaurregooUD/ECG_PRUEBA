// Configuración inicial
const ctx = document.getElementById('ecgChart').getContext('2d');
const DATA_LENGTH = 250; // Cantidad de puntos a mostrar
let isPaused = false;
let yScaleFactor = 1;
let lastDataPoints = [];
let previousValues = Array(5).fill(0); // Para filtrado simple
let wsConnection = null;

// Elementos DOM
const connectButton = document.getElementById('connectButton');
const pauseButton = document.getElementById('pauseButton');
const resetButton = document.getElementById('resetButton');
const zoomInButton = document.getElementById('zoomInButton');
const zoomOutButton = document.getElementById('zoomOutButton');
const deviceIPInput = document.getElementById('deviceIP');
const devicePortInput = document.getElementById('devicePort');

// Inicializar datos
const data = {
    labels: Array.from({length: DATA_LENGTH}, (_, i) => i),
    datasets: [{
        label: 'Señal ECG',
        data: Array(DATA_LENGTH).fill(512),
        borderColor: 'rgb(255, 0, 0)',
        borderWidth: 2,
        fill: false,
        pointRadius: 0,
        tension: 0.2 // Suavizado de línea
    }]
};

// Configuración del gráfico
const config = {
    type: 'line',
    data: data,
    options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: {
            intersect: false,
            mode: 'index'
        },
        scales: {
            x: {
                title: {
                    display: true,
                    text: 'Tiempo (ms)'
                },
                ticks: {
                    maxTicksLimit: 10
                }
            },
            y: {
                min: 0,
                max: 1023,
                title: {
                    display: true,
                    text: 'Amplitud'
                }
            }
        },
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                enabled: false
            }
        }
    }
};

const ecgChart = new Chart(ctx, config);

// Conexión WebSocket
function connectWebSocket() {
    const ip = deviceIPInput.value;
    const port = devicePortInput.value;
    
    // Cerrar conexión previa si existe
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.close();
    }
    
    updateStatus("Intentando conectar...", false);
    
    const wsUrl = `ws://${ip}:${port}`;
    wsConnection = new WebSocket(wsUrl);
    
    wsConnection.onopen = function() {
        updateStatus("Conectado al servidor", true);
        toggleControlButtons(true);
    };
    
    wsConnection.onclose = function() {
        updateStatus("Desconectado del servidor", false);
        toggleControlButtons(false);
    };
    
    wsConnection.onerror = function() {
        updateStatus("Error de conexión", false);
        toggleControlButtons(false);
    };
    
    wsConnection.onmessage = function(event) {
        if (isPaused) return;
        
        const val = parseInt(event.data);
        
        // Verificar estado de los electrodos
        if (val === 0) {
            updateStatus("Electrodos desconectados", false);
            return;
        } else {
            updateStatus("Electrodos conectados", true);
        }
        
        // Aplicar filtro de media móvil para suavizar la señal
        previousValues.shift();
        previousValues.push(val);
        const filteredVal = Math.round(previousValues.reduce((a, b) => a + b, 0) / previousValues.length);
        
        // Actualizar los datos del gráfico
        data.datasets[0].data.push(filteredVal);
        data.datasets[0].data.shift();
        
        // Guardar últimos puntos para calcular métricas
        lastDataPoints.push(filteredVal);
        if (lastDataPoints.length > 100) lastDataPoints.shift();
        
        // Actualizar métricas cada 20 mensajes recibidos
        if (lastDataPoints.length % 20 === 0) {
            updateMetrics();
        }
        
        ecgChart.update('quiet'); // Actualización silenciosa para mejor rendimiento
    };
}

// Función para actualizar el estado
function updateStatus(message, isConnected) {
    const statusElement = document.getElementById("status");
    const statusBox = document.getElementById("statusBox");
    
    statusElement.innerText = "Estado: " + message;
    
    if (isConnected) {
        statusBox.className = "status-box connected";
    } else {
        statusBox.className = "status-box disconnected";
    }
}

// Activar/desactivar botones de control
function toggleControlButtons(enabled) {
    pauseButton.disabled = !enabled;
    resetButton.disabled = !enabled;
    zoomInButton.disabled = !enabled;
    zoomOutButton.disabled = !enabled;
}

// Función para actualizar métricas
function updateMetrics() {
    if (lastDataPoints.length < 30) return;
    
    // Calcular amplitud aproximada
    const max = Math.max(...lastDataPoints);
    const min = Math.min(...lastDataPoints);
    const amplitude = max - min;
    
    // Detección simplificada de picos R
    let peaks = 0;
    const threshold = min + amplitude * 0.6;
    let aboveThreshold = false;
    
    for (let i = 0; i < lastDataPoints.length; i++) {
        if (!aboveThreshold && lastDataPoints[i] > threshold) {
            aboveThreshold = true;
            peaks++;
        } else if (aboveThreshold && lastDataPoints[i] < threshold) {
            aboveThreshold = false;
        }
    }
    
    // Estimar frecuencia cardíaca (muy aproximado)
    // 100 muestras a 50ms = 5000ms = 5s
    const bpm = Math.round(peaks * (60 / 5));
    
    // Estimar calidad de señal
    let quality = "Buena";
    if (amplitude < 100) quality = "Baja";
    else if (peaks === 0) quality = "Sin pulso detectado";
    
    // Actualizar interfaz
    document.getElementById("heartRate").innerText = bpm + " BPM";
    document.getElementById("amplitude").innerText = amplitude + " unidades";
    document.getElementById("signalQuality").innerText = quality;
}

// Configurar controles
pauseButton.addEventListener("click", function() {
    isPaused = !isPaused;
    this.innerText = isPaused ? "Reanudar" : "Pausar";
});

resetButton.addEventListener("click", function() {
    data.datasets[0].data = Array(DATA_LENGTH).fill(512);
    ecgChart.update();
    lastDataPoints = [];
    previousValues = Array(5).fill(0);
});

zoomInButton.addEventListener("click", function() {
    yScaleFactor *= 1.2;
    updateZoom();
});

zoomOutButton.addEventListener("click", function() {
    yScaleFactor /= 1.2;
    updateZoom();
});

connectButton.addEventListener("click", function() {
    connectWebSocket();
});

function updateZoom() {
    const midPoint = 512;
    const range = 512 / yScaleFactor;
    
    ecgChart.options.scales.y.min = Math.max(0, midPoint - range);
    ecgChart.options.scales.y.max = Math.min(1023, midPoint + range);
    ecgChart.update();
}

// Detectar cuando se cierra la ventana
window.addEventListener('beforeunload', function() {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.close();
    }
});
