import express from 'express';
// ⬇️ Usamos pigpio en lugar de onoff (sysfs)
import dotenv from 'dotenv';

dotenv.config();

const PORT = Number(process.env.PORT ?? 5000);
const RELAY_GPIO = Number(process.env.RELAY_GPIO ?? 17);
const ACTIVE_LOW = String(process.env.ACTIVE_LOW ?? 'true').toLowerCase() === 'true';

type RelayState = 'ON' | 'OFF';

// Cargamos pigpio con require para evitar problemas de tipos
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Gpio } = require('pigpio');

// Inicializa GPIO en modo salida
const relay = new Gpio(RELAY_GPIO, { mode: Gpio.OUTPUT });

// Helpers de escritura/lectura según activo LOW/HIGH
function writeState(desired: RelayState) {
    const value = desired === 'ON'
        ? (ACTIVE_LOW ? 0 : 1)
        : (ACTIVE_LOW ? 1 : 0);

    relay.digitalWrite(value);
}

function readState(): RelayState {
    const raw: 0 | 1 = relay.digitalRead(); // 0 o 1
    if (ACTIVE_LOW) {
        return raw === 0 ? 'ON' : 'OFF';
    } else {
        return raw === 1 ? 'ON' : 'OFF';
    }
}

// Estado inicial consistente
let currentState: RelayState = readState();

const app = express();
app.use(express.json());                 // JSON en POST
app.use(express.text({ type: '*/*' }));  // por si envían texto plano

// Healthcheck rápido
app.get('/health', (_req, res) => res.json({ ok: true }));

// GET estado: {"state":"ON" | "OFF"}
app.get('/relay/1', (_req, res) => {
    try {
        const state = readState();
        currentState = state;
        res.json({ state });
    } catch {
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

        writeState(desired as RelayState);
        currentState = readState();
        res.json({ state: currentState });
    } catch {
        res.status(500).json({ error: 'Failed to write GPIO state' });
    }
});

// Limpieza al salir
function cleanup() {
    try {
        // Dejar el relé en OFF por seguridad
        const off = ACTIVE_LOW ? 1 : 0;
        relay.digitalWrite(off);
    } catch { /* ignore */ }
}

process.on('SIGINT',  () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Relay API listening on http://0.0.0.0:${PORT}  (GPIO ${RELAY_GPIO}, ACTIVE_LOW=${ACTIVE_LOW}, pigpio)`);
});
