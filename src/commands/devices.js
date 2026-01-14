import { Command } from 'commander';
import { getDevices, getDeviceByUuid, getDeviceName } from '../utils/streamdeck-config.js';

const devices = new Command('devices')
    .description('Manage Stream Deck devices');

devices
    .command('list')
    .description('List all Stream Deck devices')
    .action(async () => {
        try {
            const deviceList = await getDevices();

            if (deviceList.length === 0) {
                console.log('No Stream Deck devices found.');
                return;
            }

            console.log('\nStream Deck Devices:\n');
            console.log('─'.repeat(80));

            for (const device of deviceList) {
                const name = getDeviceName(device.uuid);
                if (name) {
                    console.log(`Name:     ${name}`);
                }
                console.log(`Model:    ${device.model}`);
                console.log(`UUID:     ${device.uuid}`);
                console.log(`Profiles: ${device.profiles.length}`);
                console.log('─'.repeat(80));
            }
        } catch (err) {
            console.error('Error listing devices:', err.message);
            process.exit(1);
        }
    });

devices
    .command('info <uuid>')
    .description('Show detailed information about a specific device')
    .action(async (uuid) => {
        try {
            const device = await getDeviceByUuid(uuid);

            if (!device) {
                console.error(`Device not found: ${uuid}`);
                process.exit(1);
            }

            const name = getDeviceName(device.uuid);

            console.log('\nDevice Information:\n');
            console.log('─'.repeat(80));
            if (name) {
                console.log(`Name:     ${name}`);
            }
            console.log(`Model:    ${device.model}`);
            console.log(`UUID:     ${device.uuid}`);
            console.log(`Profiles: ${device.profiles.length}`);
            console.log('─'.repeat(80));

            if (device.profiles.length > 0) {
                console.log('\nProfiles on this device:\n');

                for (const profile of device.profiles) {
                    const name = profile.manifest.Name || '(unnamed)';
                    const app = profile.manifest.AppIdentifier || '(default)';
                    console.log(`  ${profile.id}`);
                    console.log(`    Name: ${name}`);
                    console.log(`    App:  ${app}`);
                    console.log('');
                }
            }
        } catch (err) {
            console.error('Error getting device info:', err.message);
            process.exit(1);
        }
    });

export default devices;
