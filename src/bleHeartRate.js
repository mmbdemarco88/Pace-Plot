import { store } from './state/store.js';
import { parseBleHeartRateMeasurement } from './gpsEngine.js';
import { playTurnChime, speakInstruction } from './voiceNav.js';
import { hasPremiumAccess, openUpgradeModal } from './premium.js';

export function setupBleHeartRateMonitor({ onHeartRateUpdate } = {}) {
  if (typeof document === 'undefined') return;
  const btnConnectBluetoothHr = document.getElementById('btnConnectBluetoothHr');
  const btnConnectBluetoothHrLabel = document.getElementById('btnConnectBluetoothHrLabel');
  const bleHrDeviceStatusText = document.getElementById('bleHrDeviceStatusText');

  if (!btnConnectBluetoothHr) return;

  btnConnectBluetoothHr.addEventListener('click', async () => {
    if (!hasPremiumAccess()) {
      openUpgradeModal('Bluetooth Heart Rate Sensor pairing is a Pace Plot PRO feature.');
      return;
    }
    if (store.isBleHrConnected && store.bleHrDevice && store.bleHrDevice.gatt?.connected) {
      store.bleHrDevice.gatt.disconnect();
      store.isBleHrConnected = false;
      if (btnConnectBluetoothHrLabel) {
        btnConnectBluetoothHrLabel.textContent = 'Pair Bluetooth Heart Rate Monitor (BLE)';
      }
      if (bleHrDeviceStatusText) {
        bleHrDeviceStatusText.textContent = 'Disconnected from Bluetooth HR sensor';
      }
      return;
    }

    if (typeof navigator === 'undefined' || !('bluetooth' in navigator) || !navigator.bluetooth) {
      if (bleHrDeviceStatusText) {
        bleHrDeviceStatusText.textContent = 'Web Bluetooth requires Chrome on Android, macOS, or Windows.';
      }
      speakInstruction(
        'Web Bluetooth is supported in Chrome on Android and desktop. Open in Chrome to pair your BLE heart rate strap or watch.'
      );
      return;
    }

    try {
      if (btnConnectBluetoothHrLabel) {
        btnConnectBluetoothHrLabel.textContent = 'Scanning for BLE Heart Rate Sensor...';
      }
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['heart_rate'] }]
      });
      store.bleHrDevice = device;
      device.addEventListener('gattserverdisconnected', () => {
        store.isBleHrConnected = false;
        if (btnConnectBluetoothHrLabel) {
          btnConnectBluetoothHrLabel.textContent = 'Pair Bluetooth Heart Rate Monitor (BLE)';
        }
        if (bleHrDeviceStatusText) {
          bleHrDeviceStatusText.textContent = 'BLE Sensor Disconnected';
        }
      });

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('heart_rate');
      const characteristic = await service.getCharacteristic('heart_rate_measurement');
      await characteristic.startNotifications();

      characteristic.addEventListener('characteristicvaluechanged', (event) => {
        const bpm = parseBleHeartRateMeasurement(event.target.value);
        if (bpm) {
          store.currentLiveSensorHr = bpm;
          const hudHR = document.getElementById('hudHR');
          if (hudHR) hudHR.textContent = `${bpm} bpm`;
          if (typeof onHeartRateUpdate === 'function') {
            onHeartRateUpdate(bpm);
          }
        }
      });

      store.isBleHrConnected = true;
      const devName = device.name || 'BLE Heart Rate Monitor';
      if (btnConnectBluetoothHrLabel) {
        btnConnectBluetoothHrLabel.textContent = `Connected: ${devName} (Tap to Disconnect)`;
      }
      if (bleHrDeviceStatusText) {
        bleHrDeviceStatusText.textContent = `Streaming live GATT 0x2A37 BPM from ${devName}`;
      }
      playTurnChime();
      speakInstruction(`Connected to ${devName}. Streaming live heart rate telemetry.`);
    } catch (err) {
      if (btnConnectBluetoothHrLabel) {
        btnConnectBluetoothHrLabel.textContent = 'Pair Bluetooth Heart Rate Monitor (BLE)';
      }
      if (bleHrDeviceStatusText) {
        bleHrDeviceStatusText.textContent = 'BLE pairing cancelled or no sensor selected.';
      }
      console.warn('[BLE HR] Pairing notice:', err);
    }
  });
}
