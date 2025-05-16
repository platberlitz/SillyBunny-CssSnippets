import { characters, getRequestHeaders, this_chid } from '../../../../../script.js';
import { getContext } from '../../../../extensions.js';
import { power_user } from '../../../../power-user.js';
import { delay, uuidv4 } from '../../../../utils.js';
import { FilesPluginApi } from '../index.js';
import { highlightText } from '../lib/prism-code-editor/prism/index.js';
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
        try {
            await FilesPluginApi.unwatch(this.localPath);
        } catch (ex) {
            alert(ex?.message ?? 'something went wrong');
        }
        this.isWatching = false;
    }
    async editLocally() {
        const path = `~/user/CustomCSS/${uuidv4()}.${this.name.replace(/[^a-z0-9_. ]+/gi, '-')}.css`;

        try {
            // save snippet to file
            const blob = new Blob([this.content], { type:'text' });
            const reader = new FileReader();
            const prom = new Promise(resolve=>reader.addEventListener('load', resolve));
            reader.readAsDataURL(blob);
            await prom;
            const result = await FilesPluginApi.put(path, { file:/**@type {string}*/(reader.result) });
            const finalPath = `~/user/CustomCSS/${result.name}`;
            this.localPath = finalPath;

            // launch snippet file in local editor
            await FilesPluginApi.open(finalPath);

            // watch snippet file
            this.isWatching = true;
            const ev = await FilesPluginApi.watch(finalPath);
            ev.addEventListener('message', async(/**@type {boolean}*/exists)=>{
                if (exists) {
                    this.content = await (await FilesPluginApi.get(finalPath)).text();
                    this.li.querySelector('code').innerHTML = highlightText(this.content, 'css');
                    this.save();
                }
            });

            // wait for stop watching
            while (this.isWatching) {
                await delay(1000);
            }

            // delete snippet file
            await FilesPluginApi.delete(finalPath);
        } catch (ex) {
            alert(ex?.message ?? 'something went wrong');
        }
    }
}
