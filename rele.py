import RPi.GPIO as GPIO
import time

PIN = 21          # BCM del pin que uses (21 en tu prueba)
ACTIVE_LOW = True # low-level trigger típico: LOW=ON, HIGH=OFF

# Elegí el modo que te funcione mejor
MODO = "open-drain"   # "push-pull"  o  "open-drain"

GPIO.setmode(GPIO.BCM)

def setup_safe_initial():
    """
    Estado inicial seguro: OFF.
    - push-pull: salida en HIGH (3.3V).
    - open-drain: entrada (alta Z) para soltar la línea.
    """
    if MODO == "push-pull":
        if ACTIVE_LOW:
            GPIO.setup(PIN, GPIO.OUT, initial=GPIO.HIGH)  # OFF
        else:
            GPIO.setup(PIN, GPIO.OUT, initial=GPIO.LOW)   # OFF si HIGH=ON
    else:  # open-drain
        GPIO.setup(PIN, GPIO.IN)  # OFF = soltar (alta impedancia)

def rele_on():
    if ACTIVE_LOW:
        if MODO == "push-pull":
            # SOLO setup, sin output: pone el pin en LOW de una
            GPIO.setup(PIN, GPIO.LOW)   # ON (LOW)
        else:  # open-drain
            GPIO.setup(PIN, GPIO.OUT)   # salida
            GPIO.setup(PIN, GPIO.LOW)   # hunde a GND -> ON
    else:
        if MODO == "push-pull":
            GPIO.setup(PIN, GPIO.HIGH)  # ON (HIGH)
        else:  # open-drain no aplica bien si ON=HIGH (evitalo)
            GPIO.setup(PIN, GPIO.OUT)
            GPIO.setup(PIN, GPIO.HIGH)  # empuja 3.3V (si tu módulo lo acepta)

def rele_off():
    if ACTIVE_LOW:
        if MODO == "push-pull":
            GPIO.setup(PIN, GPIO.HIGH)  # OFF (HIGH)
        else:  # open-drain
            GPIO.setup(PIN, GPIO.IN)    # OFF = soltar (alta Z)
    else:
        if MODO == "push-pull":
            GPIO.setup(PIN, GPIO.LOW)   # OFF (LOW)
        else:
            # Para ON=HIGH, open-drain no es ideal. Soltamos igual:
            GPIO.setup(PIN, GPIO.IN)    # OFF = alta Z

try:
    setup_safe_initial()
    print(f"Probando relé en PIN BCM {PIN} | MODO={MODO} | ACTIVE_LOW={ACTIVE_LOW}")

    time.sleep(0.6)
    print("ON");  rele_on();  time.sleep(0.8)
    print("OFF"); rele_off(); time.sleep(0.8)
    print("ON");  rele_on();  time.sleep(0.8)
    print("OFF"); rele_off(); time.sleep(0.8)

    print("Listo.")

finally:
    # Dejar en OFF y liberar
    try:
        rele_off()
        time.sleep(0.1)
    except:
        pass
    GPIO.cleanup()
