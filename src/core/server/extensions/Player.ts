import * as alt from 'alt-server';
import { Character, CharacterDefaults } from '../../shared/interfaces/Character';
import { DiscordUser } from '../interface/DiscordUser';
import { Database, getDatabase } from 'simplymongo';
import { CurrencyTypes } from '../enums/currency';
import { Appearance } from '../../shared/interfaces/Appearance';
import { View_Events_Creator } from '../../shared/enums/views';
import { Events_Meta } from '../../shared/enums/meta';
import { Events_Misc } from '../../shared/enums/events';
import { CharacterInfo } from '../../shared/interfaces/CharacterInfo';

const db: Database = getDatabase();

declare module 'alt-server' {
    export interface Player {
        // First Join Data
        pendingLogin?: boolean; // Used when a player is pending login.
        discordToken?: string; // Used to assist with loggin in a player through oAuth2.
        hasModel?: boolean;
        currentCharacters: Array<Character>;
        pendingCharacterEdit?: boolean;
        pendingNewCharacter?: boolean;
        pendingCharacterSelect?: boolean;

        // Account Data
        account?: string;

        // Player Data
        discord?: DiscordUser;
        data?: Character;

        // Anti
        acPosition?: alt.Vector3;
        acHealth?: number;
        acArmour?: number;

        // Functions

        /**
         * emits data to the player's client-side.
         * @param  {string} eventName
         * @param  {any[]} ...args
         */
        emit(eventName: string, ...args: any[]);

        /**
         * emits meta to the players client-side. Accessible through 'alt.Player.local.meta'
         * @param  {string} key
         * @param  {any} value
         * @returns void
         */
        emitMeta(key: string, value: any): void;

        /**
         * Used to establish and create a new character based on passed Appearance data.
         * @param  {Appearance} appearance
         * @returns void
         */
        createNewCharacter(appearance: Appearance, info: CharacterInfo): void;

        /**
         * Add currency from this player based on currency type and amount.
         * @param  {CurrencyTypes} type
         * @param  {number} amount
         * @returns boolean
         */
        currencyAdd(type: CurrencyTypes, amount: number): boolean;

        /**
         * Set a currency type for this player to a specific value.
         * @param  {CurrencyTypes} type
         * @param  {number} amount
         * @returns boolean
         */
        currencySet(type: CurrencyTypes, amount: number): boolean;

        /**
         * Remove currecny from this player based on currency type and amount.
         * @param  {CurrencyTypes} type
         * @param  {number} amount
         * @returns boolean
         */
        currencySub(type: CurrencyTypes, amount: number): boolean;

        /**
         * Initialize default values for player.data
         * @returns void
         */
        init(): void;

        /**
         * Bind database character data to this player.
         * @param  {Character} data
         * @returns void
         */
        initData(data: Character): void;

        /**
         * Safely set this player's position.
         * @param  {number} x
         * @param  {number} y
         * @param  {number} z
         * @returns void
         */
        safeSetPosition(x: number, y: number, z: number): void;

        /**
         * Safelty set this player's health value.
         * @param  {number} value
         * @returns void
         */
        safeAddHealth(value: number): void;

        /**
         * Safely set this player's armour value.
         * @param  {number} value
         * @returns void
         */
        safeAddArmour(value: number): void;

        /**
         * Save specific data for this player. Update `player.data` first.
         * @param  {string} fieldName
         * @param  {any} fieldValue
         * @returns void
         */
        saveField(fieldName: string, fieldValue: any): void;

        /**
         * Save multiple fields of data for this
         * @param  {Character} dataObject
         * @returns void
         */
        savePartial(dataObject: Character): void;

        /**
         * Used to setup the player with character data.
         * @param  {Character} characterData
         * @returns void
         */
        selectCharacter(characterData: Character): void;

        /**
         * Update the appearance of the player based on player.data.
         * @returns void
         */
        updateAppearance(): void;

        /**
         * Iterates through an Object based on its keys and appends it to player.data.
         * @param  {{}} dataObject
         * @returns void
         */
        updateDataByKeys(dataObject: {}, targetDataName: string): void;

        /**
         * Used to update position based on player.data.
         * @returns void
         */
        updatePosition(): void;
    }
}

alt.Player.prototype.createNewCharacter = async function createNewCharacter(appearanceData: Partial<Appearance>, infoData: Partial<CharacterInfo>) {
    const newDocument: Partial<Character> = { ...CharacterDefaults };
    newDocument.appearance = appearanceData;
    newDocument.info = infoData;
    newDocument.account_id = this.account;

    const document = await db.insertData(newDocument, 'characters', true);
    document._id = document._id.toString(); // Re-cast id object as string.
    this.selectCharacter(document);
};

alt.Player.prototype.selectCharacter = async function selectCharacter(characterData: Partial<Character>) {
    this.data = { ...characterData };

    this.updatePosition();
    this.updateAppearance();
    this.emit(Events_Misc.StartTicks);

    // Temp Vehicle
    new alt.Vehicle('Washington', characterData.pos.x, characterData.pos.y, characterData.pos.z, 0, 0, 0);

    // Delete Current Characters from Memory
    delete this.currentCharacters;
};

alt.Player.prototype.emit = function emit(eventName: string, ...args: any[]) {
    alt.emitClient(this, eventName, ...args);
};

alt.Player.prototype.emitMeta = function emitMeta(key: string, value: any) {
    alt.emitClient(this, Events_Meta.Set, key, value);
};

alt.Player.prototype.saveField = async function saveField(fieldName: string, fieldValue: any) {
    await db.updatePartialData(this.data._id, { [fieldName]: fieldValue }, 'characters');
};

alt.Player.prototype.savePartial = async function savePartial(dataObject: Character) {
    await db.updatePartialData(this.data._id, { ...dataObject }, 'characters');
};

alt.Player.prototype.updateDataByKeys = function updateDataByKeys(dataObject: {}, targetDataName: string = '') {
    Object.keys(dataObject).forEach((key) => {
        if (targetDataName !== '') {
            this.data[targetDataName][key] = dataObject[key];
        } else {
            this.data[key] = dataObject[key];
        }
    });
};

alt.Player.prototype.init = function init() {
    this.data = Object.assign({}, CharacterDefaults);
};

alt.Player.prototype.initData = function initData(data: Character) {
    Object.keys(data).forEach((key) => {
        this.data[key] = data[key];
    });
};

alt.Player.prototype.currencyAdd = function currencyAdd(type: CurrencyTypes, amount: number) {
    if (amount > Number.MAX_SAFE_INTEGER) {
        amount = Number.MAX_SAFE_INTEGER - 1;
    }

    try {
        this.data[type] += amount;
        this.saveField(type, this.data[type]);
        return true;
    } catch (err) {
        return false;
    }
};

alt.Player.prototype.currencySub = function currencySub(type: CurrencyTypes, amount: number) {
    if (amount > Number.MAX_SAFE_INTEGER) {
        amount = Number.MAX_SAFE_INTEGER - 1;
    }

    try {
        this.data[type] -= amount;
        this.saveField(type, this.data[type]);
        return true;
    } catch (err) {
        return false;
    }
};

alt.Player.prototype.currencySet = function currencySet(type: CurrencyTypes, amount: number) {
    if (amount > Number.MAX_SAFE_INTEGER) {
        amount = Number.MAX_SAFE_INTEGER - 1;
    }

    try {
        this.data[type] = amount;
        this.saveField(type, this.data[type]);
        return true;
    } catch (err) {
        return false;
    }
};

alt.Player.prototype.safeSetPosition = function safeSetPosition(x: number, y: number, z: number) {
    if (!this.hasModel) {
        this.hasModel = true;
        this.spawn(x, y, z, 0);
        this.model = `mp_m_freemode_01`;
    }

    this.acPosition = { x, y, z };
    this.pos = { x, y, z };
};

alt.Player.prototype.safeAddHealth = function safeAddHealth(value: number) {
    if (this.health + value > 200) {
        this.acHealth = 200;
        this.health = 200;
        return;
    }

    this.acHealth = this.health + value;
    this.health += value;
};

alt.Player.prototype.safeAddArmour = function safeAddArmour(value: number) {
    if (this.armour + value > 100) {
        this.acArmour = 100;
        this.armour = 100;
        return;
    }

    this.acArmour = this.armour + value;
    this.armour += value;
};

alt.Player.prototype.updateAppearance = function updateAppearance() {
    if (this.data.appearance.sex === 0) {
        this.model = 'mp_f_freemode_01';
    } else {
        this.model = 'mp_m_freemode_01';
    }

    this.setSyncedMeta('Name', this.data.appearance.name);
    this.emitMeta('appearance', this.data.appearance);
    this.emit(View_Events_Creator.Sync, this.data.appearance);
};

alt.Player.prototype.updatePosition = function updatePosition() {
    this.safeSetPosition(this.data.pos.x, this.data.pos.y, this.data.pos.z);
};
