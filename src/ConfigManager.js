// ConfigManager.js
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

class ConfigManager {
    constructor() {
        this.userDataPath = app.getPath('userData');
        this.profilesPath = path.join(this.userDataPath, 'profiles.json');
        this.profiles = this.loadProfiles();
    }

    /**
     * Loads all profiles from the master configuration file (profiles.json).
     * If the file doesn't exist, it creates a default profile.
     * @returns {Array<object>} The array of profile objects.
     */
    loadProfiles() {
        try {
            if (fs.existsSync(this.profilesPath)) {
                const data = fs.readFileSync(this.profilesPath, 'utf-8');
                return JSON.parse(data);
            } else {
                // Create a default profile if the file doesn't exist
                const defaultProfile = {
                    id: crypto.randomUUID().substring(0, 8),
                    kioskURL: 'https://en.wikipedia.org/wiki/Space_Invaders',
                    hotkey: 'Home',
                    displayName: 'Default Profile',
                    startWithWindows: false
                };
                this.saveProfiles([defaultProfile]);
                return [defaultProfile];
            }
        } catch (error) {
            console.error('Error loading profiles:', error);
            return [];
        }
    }

    /**
     * Saves the entire array of profiles to the master configuration file.
     * @param {Array<object>} profiles The array of profiles to save.
     */
    saveProfiles(profiles) {
        try {
            fs.writeFileSync(this.profilesPath, JSON.stringify(profiles, null, 2));
            this.profiles = profiles; // Update the in-memory profiles
        } catch (error) {
            console.error('Failed to save profiles:', error);
        }
    }

    /**
     * Adds a new profile to the configuration.
     * @param {object} profileData The data for the new profile.
     * @returns {object} The newly created profile object.
     */
    addProfile(profileData) {
        const newProfile = {
            id: crypto.randomUUID().substring(0, 8),
            ...profileData
        };
        const profiles = this.getProfiles();
        profiles.push(newProfile);
        this.saveProfiles(profiles);
        return newProfile;
    }

    /**
     * Updates an existing profile.
     * @param {string} profileId The ID of the profile to update.
     * @param {object} updatedData The new data for the profile.
     * @returns {object|null} The updated profile object or null if not found.
     */
    updateProfile(profileId, updatedData) {
        const profiles = this.getProfiles();
        const profileIndex = profiles.findIndex(p => p.id === profileId);
        if (profileIndex !== -1) {
            profiles[profileIndex] = { ...profiles[profileIndex], ...updatedData };
            this.saveProfiles(profiles);
            return profiles[profileIndex];
        }
        return null;
    }

    /**
     * Deletes a profile.
     * @param {string} profileId The ID of the profile to delete.
     * @returns {boolean} True if deletion was successful, false otherwise.
     */
    deleteProfile(profileId) {
        let profiles = this.getProfiles();
        const initialLength = profiles.length;
        profiles = profiles.filter(p => p.id !== profileId);
        if (profiles.length < initialLength) {
            this.saveProfiles(profiles);
            return true;
        }
        return false;
    }

    /**
     * Gets all profiles.
     * @returns {Array<object>} The array of all profiles.
     */
    getProfiles() {
        return this.profiles;
    }

    /**
     * Gets a single profile by its ID.
     * @param {string} profileId The ID of the profile to find.
     * @returns {object|undefined} The profile object or undefined if not found.
     */
    getProfileById(profileId) {
        return this.getProfiles().find(p => p.id === profileId);
    }

    /**
     * Checks if a hotkey is already in use by another profile.
     * @param {string} hotkey The hotkey to check.
     * @param {string} currentProfileId The ID of the current profile (to be ignored in the check).
     * @returns {{isDuplicate: boolean, conflictingProfile: string|null}}
     */
    isHotkeyDuplicate(hotkey, currentProfileId) {
        if (!hotkey) {
            return { isDuplicate: false, conflictingProfile: null };
        }

        const profiles = this.getProfiles();
        const conflictingProfile = profiles.find(p => p.hotkey === hotkey && p.id !== currentProfileId);

        if (conflictingProfile) {
            return { isDuplicate: true, conflictingProfile: conflictingProfile.displayName };
        }

        return { isDuplicate: false, conflictingProfile: null };
    }
}

module.exports = ConfigManager;
