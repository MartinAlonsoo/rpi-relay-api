import express from 'express';
import { Gpio } from 'onoff';
import dotenv from "dotenv";

dotenv.config();

const PORT = Number(process.env.PORT ?? 5000);
const RELAY_GPIO = Number(process.env.RELAY_GPIO ?? 17);
const ACTIVE_LOW = String(process.env.ACTIVE_LOW ?? 'true').toLowerCase() === 'true';

// Estado deseado en memoria (para responder rápido a GET)
let currentState: 'ON' | 'OFF' = 'OFF';

// Inicializa GPIO
// 'out' => salida. Si ACTIVE_LOW, "ON" = 0; si NO, "ON" = 1
const relay = new Gpio(RELAY_GPIO, 'out');

// Helpers de escritura/lectura según activo LOW/HIGH
function writeState(desired: 'ON' | 'OFF') {
    const value = desired === 'ON'
        ? (ACTIVE_LOW ? 0 : 1)
        : (ACTIVE_LOW ? 1 : 0);

    relay.writeSync(value);
    currentState = desired;
}

function readState(): 'ON' | 'OFF' {
    const raw = relay.readSync(); // 0 o 1
    // Si activo LOW: 0 = ON, 1 = OFF; Si activo HIGH: 1 = ON, 0 = OFF
    if (ACTIVE_LOW) {
        return raw === 0 ? 'ON' : 'OFF';
    } else {
        return raw === 1 ? 'ON' : 'OFF';
    }
}

// Asegurá que el estado inicial sea consistente
currentState = readState();

const app = express();
app.use(express.json());            // JSON en POST
app.use(express.text({ type: '*/*' })); // por si envían texto plano

// Healthcheck rápido
app.get('/health', (_req, res) => {
    res.json({ ok: true });
});

// GET estado: {"state":"ON" | "OFF"}
app.get('/relay/1', (_req, res) => {
    try {
        const state = readState();
        res.json({ state });
    } catch (err) {
        res.status(500).json({ error: 'Failed to read GPIO state' });
    }
});

// POST cambio de estado: acepta JSON {"state":"ON"|"OFF"} o texto "ON"/"OFF"
app.post('/relay/1', (req, res) => {
    try {
        let desired: string | undefined;

        if (typeof req.body === 'string') {
            desired = req.body.trim();
        } else if (typeof req.body === 'object' && req.body !== null) {
            desired = (req.body.state ?? '').toString();
        }

        desired = (desired ?? '').toUpperCase();

        if (desired !== 'ON' && desired !== 'OFF') {
            return res.status(400).json({ error: 'Invalid payload. Use {"state":"ON"} or {"state":"OFF"}' });
        }

        writeState(desired as 'ON' | 'OFF');
        res.json({ state: readState() });
    } catch (err) {
        res.status(500).json({ error: 'Failed to write GPIO state' });
    }
});

// Limpieza al salir
function cleanup() {
    try {
        // Dejar el relé en OFF por seguridad
        writeState('OFF');
        relay.unexport();
    } catch { /* ignore */ }
}

process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Relay API listening on http://0.0.0.0:${PORT}  (GPIO ${RELAY_GPIO}, ACTIVE_LOW=${ACTIVE_LOW})`);
});