import { readdir, readFile, writeFile, cp, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import { execSync } from 'child_process';

const CONFIG_PATH = join(
    homedir(),
    'Library/Application Support/com.elgato.StreamDeck'
);

const PROFILES_V3_PATH = join(CONFIG_PATH, 'ProfilesV3');
const PLIST_DOMAIN = 'com.elgato.StreamDeck';

export async function getProfilesPath() {
    return PROFILES_V3_PATH;
}

export async function getAllProfiles() {
    const profiles = [];
    const entries = await readdir(PROFILES_V3_PATH, { withFileTypes: true });

    for (const entry of entries) {
        if (entry.isDirectory() && entry.name.endsWith('.sdProfile')) {
            const profilePath = join(PROFILES_V3_PATH, entry.name);
            const manifestPath = join(profilePath, 'manifest.json');

            try {
                const manifestData = await readFile(manifestPath, 'utf-8');
                const manifest = JSON.parse(manifestData);
                profiles.push({
                    id: entry.name.replace('.sdProfile', ''),
                    path: profilePath,
                    manifest
                });
            } catch (err) {
                // Skip profiles with invalid manifests
                console.error(`Warning: Could not read manifest for ${entry.name}`);
            }
        }
    }

    return profiles;
}

export async function getProfileById(profileId) {
    const profiles = await getAllProfiles();
    return profiles.find(p => p.id === profileId);
}

export async function getDevices() {
    const profiles = await getAllProfiles();
    const deviceMap = new Map();

    for (const profile of profiles) {
        const device = profile.manifest.Device;
        if (device && device.UUID) {
            if (!deviceMap.has(device.UUID)) {
                deviceMap.set(device.UUID, {
                    uuid: device.UUID,
                    model: device.Model,
                    profiles: []
                });
            }
            deviceMap.get(device.UUID).profiles.push(profile);
        }
    }

    return Array.from(deviceMap.values());
}

export async function getDeviceByUuid(uuid) {
    const devices = await getDevices();
    return devices.find(d => d.uuid === uuid);
}

export async function getProfilePages(profilePath) {
    const pagesPath = join(profilePath, 'Profiles');
    const pages = [];

    try {
        const entries = await readdir(pagesPath, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const pageManifestPath = join(pagesPath, entry.name, 'manifest.json');
                try {
                    const manifestData = await readFile(pageManifestPath, 'utf-8');
                    const manifest = JSON.parse(manifestData);
                    pages.push({
                        id: entry.name,
                        path: join(pagesPath, entry.name),
                        manifest
                    });
                } catch (err) {
                    // Skip pages with invalid manifests
                }
            }
        }
    } catch (err) {
        // No pages directory
    }

    return pages;
}

function readPlistKey(keyPath) {
    const plistPath = join(homedir(), 'Library/Preferences', `${PLIST_DOMAIN}.plist`);
    try {
        const cmd = `/usr/libexec/PlistBuddy -c "Print :${keyPath}" "${plistPath}" 2>/dev/null`;
        return execSync(cmd, { encoding: 'utf-8' }).trim();
    } catch {
        return null;
    }
}

export function getDeviceName(deviceUuid) {
    return readPlistKey(`Devices:'${deviceUuid}':DeviceName`);
}

export function getDevicePreferences(deviceUuid) {
    const preferred = readPlistKey(`Devices:'${deviceUuid}':ESDProfilesInfo:ESDProfilesPreferred`);
    const sortingStr = readPlistKey(`Devices:'${deviceUuid}':ESDProfilesInfo:ESDProfilesSorting`);
    const expandedStr = readPlistKey(`Devices:'${deviceUuid}':ESDProfilesInfo:ESDProfilesExpanded`);

    return {
        preferred: preferred || null,
        sorting: sortingStr ? sortingStr.split(',') : [],
        expanded: expandedStr ? expandedStr.split(',') : []
    };
}

export function setDevicePreferences(deviceUuid, preferences) {
    const escapeForShell = (str) => str.replace(/'/g, "'\\''");

    if (preferences.preferred) {
        const cmd = `defaults write ${PLIST_DOMAIN} "Devices" -dict-add "${escapeForShell(deviceUuid)}" "<dict><key>ESDProfilesInfo</key><dict><key>ESDProfilesPreferred</key><string>${escapeForShell(preferences.preferred)}</string></dict></dict>"`;
        // This approach doesn't work well for nested dicts, need a different method
    }

    // Use PlistBuddy for nested plist modifications
    const plistPath = join(homedir(), 'Library/Preferences', `${PLIST_DOMAIN}.plist`);

    const runPlistBuddy = (cmd) => {
        try {
            execSync(`/usr/libexec/PlistBuddy -c "${cmd}" "${plistPath}" 2>/dev/null`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
            return true;
        } catch {
            return false;
        }
    };

    // Ensure the device entry exists
    runPlistBuddy(`Add :Devices:'${deviceUuid}' dict`);
    runPlistBuddy(`Add :Devices:'${deviceUuid}':ESDProfilesInfo dict`);

    if (preferences.preferred) {
        // Try to set, if fails try to add
        if (!runPlistBuddy(`Set :Devices:'${deviceUuid}':ESDProfilesInfo:ESDProfilesPreferred ${preferences.preferred}`)) {
            runPlistBuddy(`Add :Devices:'${deviceUuid}':ESDProfilesInfo:ESDProfilesPreferred string ${preferences.preferred}`);
        }
    }

    if (preferences.sorting && preferences.sorting.length > 0) {
        const sortingStr = preferences.sorting.join(',');
        if (!runPlistBuddy(`Set :Devices:'${deviceUuid}':ESDProfilesInfo:ESDProfilesSorting ${sortingStr}`)) {
            runPlistBuddy(`Add :Devices:'${deviceUuid}':ESDProfilesInfo:ESDProfilesSorting string ${sortingStr}`);
        }
    }

    if (preferences.expanded && preferences.expanded.length > 0) {
        const expandedStr = preferences.expanded.join(',');
        if (!runPlistBuddy(`Set :Devices:'${deviceUuid}':ESDProfilesInfo:ESDProfilesExpanded ${expandedStr}`)) {
            runPlistBuddy(`Add :Devices:'${deviceUuid}':ESDProfilesInfo:ESDProfilesExpanded string ${expandedStr}`);
        }
    }
}

export async function deleteProfile(profileId) {
    const profile = await getProfileById(profileId);
    if (!profile) {
        throw new Error(`Profile not found: ${profileId}`);
    }

    await rm(profile.path, { recursive: true });

    return {
        id: profileId,
        name: profile.manifest.Name,
        path: profile.path
    };
}

export async function deleteAllProfilesForDevice(deviceUuid) {
    const device = await getDeviceByUuid(deviceUuid);
    if (!device) {
        throw new Error(`Device not found: ${deviceUuid}`);
    }

    const results = [];

    for (const profile of device.profiles) {
        try {
            const result = await deleteProfile(profile.id);
            results.push({ success: true, ...result });
        } catch (err) {
            results.push({
                success: false,
                id: profile.id,
                name: profile.manifest.Name,
                error: err.message
            });
        }
    }

    return results;
}

export async function copyProfile(sourceProfileId, targetDeviceUuid, targetDeviceModel) {
    const sourceProfile = await getProfileById(sourceProfileId);
    if (!sourceProfile) {
        throw new Error(`Source profile not found: ${sourceProfileId}`);
    }

    // Generate new UUID for the copied profile
    const newProfileId = randomUUID().toUpperCase();
    const newProfilePath = join(PROFILES_V3_PATH, `${newProfileId}.sdProfile`);

    // Copy the entire profile directory
    await cp(sourceProfile.path, newProfilePath, { recursive: true });

    // Regenerate page UUIDs to avoid conflicts with source profile
    const pageUuidMapping = await regeneratePageUuids(newProfilePath);

    // Update the manifest with new device info and remapped page UUIDs
    const manifestPath = join(newProfilePath, 'manifest.json');
    const manifestData = await readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestData);

    manifest.Device = {
        Model: targetDeviceModel,
        UUID: targetDeviceUuid
    };

    // Remap page references in the profile manifest
    if (manifest.Pages) {
        if (manifest.Pages.Current && pageUuidMapping.has(manifest.Pages.Current.toLowerCase())) {
            manifest.Pages.Current = pageUuidMapping.get(manifest.Pages.Current.toLowerCase());
        }
        if (manifest.Pages.Default && pageUuidMapping.has(manifest.Pages.Default.toLowerCase())) {
            manifest.Pages.Default = pageUuidMapping.get(manifest.Pages.Default.toLowerCase());
        }
        if (manifest.Pages.Pages && Array.isArray(manifest.Pages.Pages)) {
            manifest.Pages.Pages = manifest.Pages.Pages.map(pageId => {
                const lowerId = pageId.toLowerCase();
                return pageUuidMapping.has(lowerId) ? pageUuidMapping.get(lowerId) : pageId;
            });
        }
    }

    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    return {
        id: newProfileId,
        path: newProfilePath,
        originalId: sourceProfileId,
        name: manifest.Name,
        pageUuidMapping
    };
}

async function regeneratePageUuids(profilePath) {
    const pagesPath = join(profilePath, 'Profiles');
    const pageUuidMapping = new Map(); // oldUuid -> newUuid

    try {
        const entries = await readdir(pagesPath, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const oldPageId = entry.name;
                const newPageId = randomUUID().toUpperCase();
                const oldPagePath = join(pagesPath, oldPageId);
                const newPagePath = join(pagesPath, newPageId);

                // Store the mapping (lowercase for consistent lookup)
                pageUuidMapping.set(oldPageId.toLowerCase(), newPageId.toLowerCase());

                // Rename the page directory
                await cp(oldPagePath, newPagePath, { recursive: true });
                await rm(oldPagePath, { recursive: true });
            }
        }

        // Now update any internal page references within the page manifests
        await remapPageReferencesInProfile(pagesPath, pageUuidMapping);

    } catch (err) {
        // No pages directory or error during processing
        console.error(`Warning: Error regenerating page UUIDs: ${err.message}`);
    }

    return pageUuidMapping;
}

async function remapPageReferencesInProfile(pagesPath, pageUuidMapping) {
    try {
        const entries = await readdir(pagesPath, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const pageManifestPath = join(pagesPath, entry.name, 'manifest.json');
                try {
                    const manifestData = await readFile(pageManifestPath, 'utf-8');
                    let manifest = JSON.parse(manifestData);
                    let modified = false;

                    // Recursively search and replace page UUID references
                    const remapInObject = (obj) => {
                        if (!obj || typeof obj !== 'object') return;

                        if (Array.isArray(obj)) {
                            for (const item of obj) {
                                remapInObject(item);
                            }
                        } else {
                            for (const key of Object.keys(obj)) {
                                // Look for PageUUID references (for page navigation actions)
                                if (key === 'PageUUID' && typeof obj[key] === 'string') {
                                    const oldUuid = obj[key].toLowerCase();
                                    if (pageUuidMapping.has(oldUuid)) {
                                        obj[key] = pageUuidMapping.get(oldUuid);
                                        modified = true;
                                    }
                                } else if (typeof obj[key] === 'object') {
                                    remapInObject(obj[key]);
                                }
                            }
                        }
                    };

                    remapInObject(manifest);

                    if (modified) {
                        await writeFile(pageManifestPath, JSON.stringify(manifest, null, 2));
                    }
                } catch (err) {
                    // Skip pages with invalid manifests
                }
            }
        }
    } catch (err) {
        // No pages directory
    }
}

async function remapProfileReferences(profilePath, uuidMapping) {
    const pagesPath = join(profilePath, 'Profiles');
    let remappedCount = 0;

    try {
        const entries = await readdir(pagesPath, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const pageManifestPath = join(pagesPath, entry.name, 'manifest.json');
                try {
                    const manifestData = await readFile(pageManifestPath, 'utf-8');
                    let manifest = JSON.parse(manifestData);
                    let modified = false;

                    // Recursively search and replace ProfileUUID references
                    const remapInObject = (obj) => {
                        if (!obj || typeof obj !== 'object') return;

                        if (Array.isArray(obj)) {
                            for (const item of obj) {
                                remapInObject(item);
                            }
                        } else {
                            for (const key of Object.keys(obj)) {
                                if (key === 'ProfileUUID' && typeof obj[key] === 'string') {
                                    const oldUuid = obj[key].toLowerCase();
                                    if (uuidMapping.has(oldUuid)) {
                                        obj[key] = uuidMapping.get(oldUuid).toLowerCase();
                                        modified = true;
                                        remappedCount++;
                                    }
                                } else if (typeof obj[key] === 'object') {
                                    remapInObject(obj[key]);
                                }
                            }
                        }
                    };

                    remapInObject(manifest);

                    if (modified) {
                        await writeFile(pageManifestPath, JSON.stringify(manifest, null, 2));
                    }
                } catch (err) {
                    // Skip pages with invalid manifests
                }
            }
        }
    } catch (err) {
        // No pages directory
    }

    return remappedCount;
}

export async function copyAllProfiles(sourceDeviceUuid, targetDeviceUuid, targetDeviceModel) {
    const sourceDevice = await getDeviceByUuid(sourceDeviceUuid);
    if (!sourceDevice) {
        throw new Error(`Source device not found: ${sourceDeviceUuid}`);
    }

    const results = [];
    const uuidMapping = new Map(); // oldUuid -> newUuid

    // Phase 1: Copy all profiles and build UUID mapping
    for (const profile of sourceDevice.profiles) {
        try {
            const result = await copyProfile(profile.id, targetDeviceUuid, targetDeviceModel);
            uuidMapping.set(result.originalId.toLowerCase(), result.id);
            results.push({ success: true, ...result });
        } catch (err) {
            results.push({
                success: false,
                originalId: profile.id,
                name: profile.manifest.Name,
                error: err.message
            });
        }
    }

    // Phase 2: Remap ProfileUUID references in all copied profiles
    for (const result of results) {
        if (result.success) {
            result.remappedReferences = await remapProfileReferences(result.path, uuidMapping);
        }
    }

    // Note: Device preferences (default profile, sorting) are NOT copied
    // because modifying the plist can corrupt Stream Deck's profile data.
    // Users should set the default profile manually in the Stream Deck app.

    return {
        profiles: results
    };
}
