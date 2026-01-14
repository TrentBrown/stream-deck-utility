import { Command } from 'commander';
import { createInterface } from 'readline';
import {
    getAllProfiles,
    getProfileById,
    getProfilePages,
    getDeviceByUuid,
    copyProfile,
    copyAllProfiles,
    deleteProfile,
    deleteAllProfilesForDevice
} from '../utils/streamdeck-config.js';

async function confirm(message) {
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(`${message} (y/N): `, (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
    });
}

const profiles = new Command('profiles')
    .description('Manage Stream Deck profiles');

profiles
    .command('list')
    .description('List all profiles')
    .option('-d, --device <uuid>', 'Filter by device UUID')
    .action(async (options) => {
        try {
            let profileList = await getAllProfiles();

            if (options.device) {
                profileList = profileList.filter(
                    p => p.manifest.Device?.UUID === options.device
                );
            }

            if (profileList.length === 0) {
                console.log('No profiles found.');
                return;
            }

            console.log('\nStream Deck Profiles:\n');
            console.log('─'.repeat(100));

            for (const profile of profileList) {
                const name = profile.manifest.Name || '(unnamed)';
                const app = profile.manifest.AppIdentifier || '(default)';
                const deviceUuid = profile.manifest.Device?.UUID || '(unknown)';
                const deviceModel = profile.manifest.Device?.Model || '(unknown)';

                console.log(`ID:     ${profile.id}`);
                console.log(`Name:   ${name}`);
                console.log(`App:    ${app}`);
                console.log(`Device: ${deviceModel} (${deviceUuid})`);
                console.log('─'.repeat(100));
            }

            console.log(`\nTotal: ${profileList.length} profile(s)`);
        } catch (err) {
            console.error('Error listing profiles:', err.message);
            process.exit(1);
        }
    });

profiles
    .command('info <profileId>')
    .description('Show detailed information about a specific profile')
    .action(async (profileId) => {
        try {
            const profile = await getProfileById(profileId);

            if (!profile) {
                console.error(`Profile not found: ${profileId}`);
                process.exit(1);
            }

            const manifest = profile.manifest;
            const pages = await getProfilePages(profile.path);

            console.log('\nProfile Information:\n');
            console.log('─'.repeat(80));
            console.log(`ID:      ${profile.id}`);
            console.log(`Name:    ${manifest.Name || '(unnamed)'}`);
            console.log(`App:     ${manifest.AppIdentifier || '(default)'}`);
            console.log(`Version: ${manifest.Version || '(unknown)'}`);
            console.log('─'.repeat(80));

            console.log('\nDevice:');
            console.log(`  Model: ${manifest.Device?.Model || '(unknown)'}`);
            console.log(`  UUID:  ${manifest.Device?.UUID || '(unknown)'}`);

            console.log('\nPages:');
            console.log(`  Total:   ${manifest.Pages?.Pages?.length || 0}`);
            console.log(`  Current: ${manifest.Pages?.Current || '(none)'}`);
            console.log(`  Default: ${manifest.Pages?.Default || '(none)'}`);

            if (pages.length > 0) {
                console.log('\nPage Details:\n');

                for (const page of pages) {
                    const pageName = page.manifest.Name || '(unnamed)';
                    const controllers = page.manifest.Controllers || [];
                    let actionCount = 0;

                    for (const controller of controllers) {
                        if (controller.Actions) {
                            actionCount += Object.keys(controller.Actions).length;
                        }
                    }

                    console.log(`  ${page.id}`);
                    console.log(`    Name:    ${pageName}`);
                    console.log(`    Actions: ${actionCount}`);
                    console.log('');
                }
            }

            console.log(`\nPath: ${profile.path}`);
        } catch (err) {
            console.error('Error getting profile info:', err.message);
            process.exit(1);
        }
    });

profiles
    .command('copy <profileId>')
    .description('Copy a profile to another device')
    .requiredOption('-t, --to-device <uuid>', 'Target device UUID')
    .action(async (profileId, options) => {
        try {
            const sourceProfile = await getProfileById(profileId);
            if (!sourceProfile) {
                console.error(`Source profile not found: ${profileId}`);
                process.exit(1);
            }

            const targetDevice = await getDeviceByUuid(options.toDevice);
            if (!targetDevice) {
                console.error(`Target device not found: ${options.toDevice}`);
                console.error('Use "devices list" to see available devices.');
                process.exit(1);
            }

            console.log(`\nCopying profile "${sourceProfile.manifest.Name}" to device ${targetDevice.model}...`);

            const result = await copyProfile(profileId, targetDevice.uuid, targetDevice.model);

            console.log('\nProfile copied successfully!\n');
            console.log('─'.repeat(80));
            console.log(`Original ID: ${result.originalId}`);
            console.log(`New ID:      ${result.id}`);
            console.log(`Name:        ${result.name}`);
            console.log(`Path:        ${result.path}`);
            console.log('─'.repeat(80));
            console.log('\nRestart Stream Deck app to see the new profile.');
        } catch (err) {
            console.error('Error copying profile:', err.message);
            process.exit(1);
        }
    });

profiles
    .command('copy-all')
    .description('Copy all profiles from one device to another')
    .requiredOption('-f, --from-device <uuid>', 'Source device UUID')
    .requiredOption('-t, --to-device <uuid>', 'Target device UUID')
    .option('-r, --replace', 'Delete existing profiles on target device before copying')
    .option('-y, --yes', 'Skip confirmation prompts')
    .action(async (options) => {
        try {
            const sourceDevice = await getDeviceByUuid(options.fromDevice);
            if (!sourceDevice) {
                console.error(`Source device not found: ${options.fromDevice}`);
                console.error('Use "devices list" to see available devices.');
                process.exit(1);
            }

            const targetDevice = await getDeviceByUuid(options.toDevice);
            if (!targetDevice) {
                console.error(`Target device not found: ${options.toDevice}`);
                console.error('Use "devices list" to see available devices.');
                process.exit(1);
            }

            if (sourceDevice.uuid === targetDevice.uuid) {
                console.error('Source and target devices cannot be the same.');
                process.exit(1);
            }

            // Handle --replace option
            if (options.replace && targetDevice.profiles.length > 0) {
                console.log(`\nTarget device "${targetDevice.model}" has ${targetDevice.profiles.length} existing profile(s):`);
                console.log('─'.repeat(80));
                for (const profile of targetDevice.profiles) {
                    console.log(`  - ${profile.manifest.Name || '(unnamed)'}`);
                }
                console.log('─'.repeat(80));

                if (!options.yes) {
                    const confirmed = await confirm(`\nDelete all ${targetDevice.profiles.length} profile(s) on target device before copying?`);
                    if (!confirmed) {
                        console.log('Operation cancelled.');
                        process.exit(0);
                    }
                }

                console.log(`\nDeleting ${targetDevice.profiles.length} profile(s) from target device...`);
                const deleteResults = await deleteAllProfilesForDevice(targetDevice.uuid);

                let deleteSuccess = 0;
                let deleteFail = 0;
                for (const result of deleteResults) {
                    if (result.success) {
                        deleteSuccess++;
                    } else {
                        deleteFail++;
                        console.error(`  Failed to delete "${result.name}": ${result.error}`);
                    }
                }
                console.log(`Deleted ${deleteSuccess} profile(s)${deleteFail > 0 ? `, ${deleteFail} failed` : ''}.`);
            }

            console.log(`\nCopying ${sourceDevice.profiles.length} profile(s) from ${sourceDevice.model} to ${targetDevice.model}...\n`);

            const { profiles: results, preferences } = await copyAllProfiles(
                sourceDevice.uuid,
                targetDevice.uuid,
                targetDevice.model
            );

            console.log('─'.repeat(80));

            let successCount = 0;
            let failCount = 0;
            let totalRemapped = 0;

            for (const result of results) {
                if (result.success) {
                    successCount++;
                    totalRemapped += result.remappedReferences || 0;
                    console.log(`✓ ${result.name}`);
                    console.log(`  Original: ${result.originalId}`);
                    console.log(`  New:      ${result.id}`);
                    if (result.remappedReferences > 0) {
                        console.log(`  Remapped: ${result.remappedReferences} profile reference(s)`);
                    }
                } else {
                    failCount++;
                    console.log(`✗ ${result.name}`);
                    console.log(`  Error: ${result.error}`);
                }
                console.log('');
            }

            console.log('─'.repeat(80));
            console.log(`\nSummary: ${successCount} copied, ${failCount} failed, ${totalRemapped} profile references remapped`);

            // Show preferences that were copied
            if (preferences.target.preferred) {
                // Find the profile name for the default
                const defaultProfile = results.find(r => r.id.toLowerCase() === preferences.target.preferred);
                const defaultName = defaultProfile?.name || preferences.target.preferred;
                console.log(`\nDefault profile set to: ${defaultName}`);
            }

            if (preferences.target.sorting.length > 0) {
                console.log(`Profile sort order copied (${preferences.target.sorting.length} profiles)`);
            }

            if (successCount > 0) {
                console.log('\nRestart Stream Deck app to see the new profiles.');
            }
        } catch (err) {
            console.error('Error copying profiles:', err.message);
            process.exit(1);
        }
    });

profiles
    .command('delete <profileId>')
    .description('Delete a profile')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (profileId, options) => {
        try {
            const profile = await getProfileById(profileId);

            if (!profile) {
                console.error(`Profile not found: ${profileId}`);
                process.exit(1);
            }

            const profileName = profile.manifest.Name || '(unnamed)';
            const deviceModel = profile.manifest.Device?.Model || '(unknown)';

            console.log('\nProfile to delete:');
            console.log('─'.repeat(80));
            console.log(`ID:     ${profileId}`);
            console.log(`Name:   ${profileName}`);
            console.log(`Device: ${deviceModel}`);
            console.log('─'.repeat(80));

            if (!options.yes) {
                const confirmed = await confirm(`\nAre you sure you want to delete "${profileName}"?`);
                if (!confirmed) {
                    console.log('Deletion cancelled.');
                    process.exit(0);
                }
            }

            const result = await deleteProfile(profileId);

            console.log(`\nProfile "${result.name}" deleted successfully.`);
            console.log('\nRestart Stream Deck app to reflect the changes.');
        } catch (err) {
            console.error('Error deleting profile:', err.message);
            process.exit(1);
        }
    });

export default profiles;
