export type RelayState = 'ON' | 'OFF';

export interface RelayDriver {
    read(): RelayState;
    write(s: RelayState): void;
    cleanup(): void;
}

class MockDriver implements RelayDriver {
    private state: RelayState = 'OFF';
    read() { return this.state; }
    write(s: RelayState) { this.state = s; }
    cleanup() {}
}

export function createDriver(gpio: number, activeLow: boolean): RelayDriver {
    if (process.platform !== 'linux') {
        return new MockDriver();
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Gpio } = require('pigpio');
    const pin = new Gpio(gpio, { mode: Gpio.OUTPUT });

    const driver: RelayDriver = {
        read() {
            const raw: 0 | 1 = pin.digitalRead();
            if (activeLow) return raw === 0 ? 'ON' : 'OFF';
            return raw === 1 ? 'ON' : 'OFF';
        },
        write(s: RelayState) {
            const v = s === 'ON' ? (activeLow ? 0 : 1) : (activeLow ? 1 : 0);
            pin.digitalWrite(v);
        },
        cleanup() {
            try {
                // dejar en OFF por seguridad
                const off = activeLow ? 1 : 0;
                pin.digitalWrite(off);
            } catch {}
        }
    };
    return driver;
}