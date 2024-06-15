import { characters, getRequestHeaders, this_chid } from '../../../../../script.js';
import { getContext } from '../../../../extensions.js';
import { power_user } from '../../../../power-user.js';
import { uuidv4 } from '../../../../utils.js';
import { Settings } from './Settings.js';

export class Snippet {
    /**
     * @param {Settings} settings
     * @param {object} props
     * @param {object} settingsProps
     * @returns {Snippet}
     */
    static from(settings, props, settingsProps = null) {
        props.settings = settings;
        props.isWatching = false;
        if (props.isTheme !== undefined) delete props.isTheme;
        if (props.isCollapsedd !== undefined) {
            props.isCollapsed = props.isCollapsedd;
            delete props.isCollapsedd;
        }
        if (props.themeList === undefined) {
            props.themeList = Object.keys((settingsProps ?? settings).themeSnippets).filter(key=>(settingsProps ?? settings).themeSnippets[key]?.includes(props.name));
        }
        return Object.assign(new this(settings), props);
    }



    /**@type {Settings}*/ settings;

    /**@type {String}*/ id;
    /**@type {String}*/ name = '';
    /**@type {Boolean}*/ isDisabled = false;
    /**@type {Boolean}*/ isGlobal = true;
    /**@type {String}*/ content = '';
    /**@type {Boolean}*/ isCollapsed = false;
    /**@type {Boolean}*/ isSynced = false;
    /**@type {Boolean}*/ isDeleted = false;
    /**@type {number}*/ modifiedOn = 0;
    /**@type {string[]}*/ themeList = [];
    /**@type {string[]}*/ charList = [];
    /**@type {string[]}*/ groupList = [];
    /**@type {boolean}*/ isWatching = false;

    /**@type {HTMLElement}*/ li;

    get isTheme() {
        return this.themeList.includes(power_user.theme);
    }
    get isChat() {
        return this.charList.includes(characters[getContext().characterId]?.avatar) || this.groupList.includes(getContext().groupId);
    }
    get theme() {
        return this.themeList.join(';');
    }
    get css() {
        return this.content;
    }
    get title() {
        return this.name;
    }
    get wasSynced() {
        return this.settings.getSynced().find(it=>it.id == this.id && it.isSynced);
    }

    /**
     * @param {Settings} settings
     * @param {string} content
     * @param {string} name
     */
    constructor(settings, content = '', name = '') {
        this.id = uuidv4();
        this.settings = settings;
        this.content = content;
        this.name = name;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            isDisabled: this.isDisabled,
            isGlobal: this.isGlobal,
            content: this.content,
            isCollapsed: this.isCollapsed,
            isSynced: this.isSynced,
            isDeleted: this.isDeleted,
            modifiedOn: this.modifiedOn,
            themeList: this.themeList,
            charList: this.charList,
            groupList: this.groupList,
        };
    }

    save(skipSync = false) {
        this.modifiedOn = new Date().getTime();
        if (!skipSync && (this.isSynced || this.wasSynced)) {
            const data = this.settings.getSynced();
            const oldSnippet = data.find(it=>it.id == this.id);
            if (oldSnippet) {
                Object.assign(oldSnippet, this.toJSON());
            } else {
                data.push(this);
            }
            this.settings.setSynced(data);
        }
        this.settings.save();
    }

    async stopEditLocally() {
        const response = await fetch('/api/plugins/files/unwatch', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                path: this.localPath,
            }),
        });
        if (!response.ok) {
            alert('something went wrong');
            return;
        }
        this.isWatching = false;
    }
    async editLocally() {
        const path = `~/user/CustomCSS/${uuidv4()}.${this.name.replace(/[^a-z0-9_. ]+/gi, '-')}.css`;

        // save snippet to file
        const blob = new Blob([this.content], { type:'text' });
        const reader = new FileReader();
        const prom = new Promise(resolve=>reader.addEventListener('load', resolve));
        reader.readAsDataURL(blob);
        await prom;
        const putResponse = await fetch('/api/plugins/files/put', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                path,
                file: reader.result,
            }),
        });
        if (!putResponse.ok) {
            alert('something went wrong');
            return;
        }
        const finalPath = `~/user/CustomCSS/${(await putResponse.json()).name}`;
        this.localPath = finalPath;

        // launch snippet file in local editor
        const openResponse = await fetch('/api/plugins/files/open', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                path: finalPath,
            }),
        });
        if (!openResponse.ok) {
            alert('something went wrong');
            return;
        }

        // watch snippet file
        this.isWatching = true;
        while (this.isWatching) {
            const watchResponse = await fetch('/api/plugins/files/watch', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({
                    path: finalPath,
                    interval: this.settings.watchInterval,
                }),
            });
            if (!watchResponse.ok) {
                alert('something went wrong');
                return;
            }
            this.content = await watchResponse.text();
            const ta = this.li.querySelector('.csss--content');
            ta.value = this.content;
            ta.dispatchEvent(new Event('input', { bubbles:true }));
            this.save();
        }
        const delResponse = await fetch('/api/plugins/files/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                path: finalPath,
            }),
        });
        if (!delResponse.ok) {
            alert('something went wrong');
            return;
        }
    }
}
