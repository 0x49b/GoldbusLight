import type {DMXPartyAudioInputDevice} from "../types/controller";

export function pickLoopbackDevice(devices: DMXPartyAudioInputDevice[]): DMXPartyAudioInputDevice | undefined {
    return devices.find((device) => device.isLoopback);
}

export function listUSBMicDevices(devices: DMXPartyAudioInputDevice[]): DMXPartyAudioInputDevice[] {
    return devices.filter((device) => device.isUSB);
}

export function pickUSBMicDevice(devices: DMXPartyAudioInputDevice[]): DMXPartyAudioInputDevice | undefined {
    const usbDevices = listUSBMicDevices(devices);
    if (usbDevices.length === 0) {
        return undefined;
    }
    const explicit = usbDevices.find((device) => /usb|uac|external/i.test(device.name));
    return explicit ?? usbDevices[0];
}

export function formatPartyTimestamp(value?: string): string {
    if (!value) {
        return "never";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "unknown";
    }
    const ageSec = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
    if (ageSec < 2) {
        return "just now";
    }
    if (ageSec < 60) {
        return `${ageSec}s ago`;
    }
    return `${Math.round(ageSec / 60)}m ago`;
}
