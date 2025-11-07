import os
import signal
import atexit
from flask import Flask, request, jsonify
from dotenv import load_dotenv

# === Config ===
load_dotenv()
PORT       = int(os.getenv("PORT", "5000"))
GPIO_PIN   = int(os.getenv("GPIO_PIN", "21"))   # BCM 21 por defecto
ACTIVE_LOW = os.getenv("ACTIVE_LOW", "true").lower() == "true"
OPEN_DRAIN = os.getenv("OPEN_DRAIN", "true").lower() == "true"

# === GPIO ===
import RPi.GPIO as GPIO
GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)

# OFF seguro al iniciar
if OPEN_DRAIN:
    # OFF = alta impedancia (soltar la línea)
    GPIO.setup(GPIO_PIN, GPIO.IN)
else:
    # OFF según ACTIVE_LOW
    if ACTIVE_LOW:
        GPIO.setup(GPIO_PIN, GPIO.OUT, initial=GPIO.HIGH)  # HIGH = OFF (low-level trigger)
    else:
        GPIO.setup(GPIO_PIN, GPIO.OUT, initial=GPIO.LOW)   # LOW  = OFF (si HIGH es ON)

def rele_on():
    """
    En low-level trigger típico: ON = nivel BAJO en el pin.
    Modo open-drain: ON = OUTPUT + LOW (hundir a GND).
    """
    if OPEN_DRAIN:
        GPIO.setup(GPIO_PIN, GPIO.OUT)
        GPIO.setup(GPIO_PIN, GPIO.LOW)  # atajo admitido por RPi.GPIO
    else:
        if ACTIVE_LOW:
            GPIO.output(GPIO_PIN, GPIO.LOW)
        else:
            GPIO.output(GPIO_PIN, GPIO.HIGH)

def rele_off():
    """
    OFF:
      - open-drain: INPUT (alta impedancia) para soltar la línea
      - push-pull:  HIGH si ACTIVE_LOW, LOW si no
    """
    if OPEN_DRAIN:
        GPIO.setup(GPIO_PIN, GPIO.IN)
    else:
        if ACTIVE_LOW:
            GPIO.output(GPIO_PIN, GPIO.HIGH)
        else:
            GPIO.output(GPIO_PIN, GPIO.LOW)

def rele_read_state():
    """
    Lee el estado interpretado ON/OFF.
    En open-drain OFF=INPUT: GPIO.input devuelve 1 si el módulo sube la línea.
    """
    # Si está en INPUT, RPi.GPIO igual permite leer; si está en OUTPUT, también.
    raw = GPIO.input(GPIO_PIN)  # 0 o 1
    if OPEN_DRAIN:
        # En low-level trigger: 0 => ON (hundido), 1 => OFF (soltado)
        return "ON" if raw == 0 else "OFF"
    else:
        if ACTIVE_LOW:
            return "ON" if raw == 0 else "OFF"
        else:
            return "ON" if raw == 1 else "OFF"

def cleanup():
    try:
        # deja en OFF por seguridad
        try:
            rele_off()
        except Exception:
            pass
        GPIO.cleanup()
    except Exception:
        pass

atexit.register(cleanup)
signal.signal(signal.SIGTERM, lambda *_: (cleanup(), exit(0)))
signal.signal(signal.SIGINT,  lambda *_: (cleanup(), exit(0)))

# === Flask ===
app = Flask(__name__)

@app.get("/health")
def health():
    return jsonify(ok=True)

@app.get("/relay/1")
def get_state():
    try:
        return jsonify(state=rele_read_state())
    except Exception:
        return jsonify(error="Failed to read GPIO state"), 500

@app.post("/relay/1")
def set_state():
    try:
        desired = None
        # Soportar JSON o texto plano
        if request.is_json:
            body = request.get_json(silent=True)
            if isinstance(body, dict) and "state" in body:
                desired = str(body["state"]).upper()
        if desired is None:
            # texto plano u otro
            desired = (request.data or b"").decode("utf-8").strip().upper()

        if desired not in ("ON", "OFF"):
            return jsonify(error='Invalid payload. Use {"state":"ON"} or {"state":"OFF"}'), 400

        if desired == "ON":
            rele_on()
        else:
            rele_off()

        return jsonify(state=rele_read_state())
    except Exception:
        return jsonify(error="Failed to write GPIO state"), 500

if __name__ == "__main__":
    print(f"Relay API (Flask) listening on 0.0.0.0:{PORT} | GPIO_PIN={GPIO_PIN} "
          f"| ACTIVE_LOW={ACTIVE_LOW} | OPEN_DRAIN={OPEN_DRAIN}")
    app.run(host="0.0.0.0", port=PORT)