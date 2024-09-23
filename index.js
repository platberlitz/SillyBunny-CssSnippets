import { characters, getCurrentChatId, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings, getContext } from '../../../extensions.js';
import { groups } from '../../../group-chats.js';
import { power_user } from '../../../power-user.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from '../../../slash-commands/SlashCommandArgument.js';
import { SlashCommandEnumValue } from '../../../slash-commands/SlashCommandEnumValue.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { debounce, delay, getSortableDelay, isTrueBoolean } from '../../../utils.js';
import { Settings } from './src/Settings.js';
import { Snippet } from './src/Snippet.js';

function isTrueFlag(value) {
    return isTrueBoolean((value ?? 'false') || 'true');
}




const initSettings = ()=>{
    settings = Settings.from(extension_settings.cssSnippets ?? {});
    extension_settings.cssSnippets = settings;
    settings.onCssChanged = ()=>updateCss();
    const synced = settings.getSynced();
    for (const snippetProps of synced) {
        const snippet = settings.snippetList.find(it=>it.id == snippetProps.id);
        if (snippet) {
            if (!snippetProps.isSynced) {
                if (snippet.isSynced) {
                    snippet.isSynced = false;
                    snippet.save();
                }
                continue;
            }
            if (snippet.modifiedOn < snippetProps.modifiedOn) {
                if (snippetProps.isDeleted) {
                    settings.snippetList.splice(settings.snippetList.indexOf(snippet), 1);
                    snippet.save();
                } else {
                    Object.assign(snippet, snippetProps);
                    snippet.save(true);
                }
            }
        } else if (snippetProps.isSynced && !snippetProps.isDeleted) {
            const newSnippet = Snippet.from(settings, snippetProps);
            settings.snippetList.push(newSnippet);
            newSnippet.save(true);
        }
    }
};
const init = async()=>{
    const h4 = document.querySelector('#CustomCSS-block > h4');
    const btn = document.createElement('span'); {
        btn.classList.add('csss--trigger');
        btn.classList.add('menu_button');
        btn.classList.add('menu_button_icon');
        btn.classList.add('fa-solid');
        btn.classList.add('fa-list-check');
        btn.title = 'Manage CSS snippets';
        btn.addEventListener('click', ()=>showCssManager());
        h4.append(btn);
    }
    initSettings();
    hasFilesPlugin = (await fetch('/api/plugins/files', { method:'HEAD' })).ok;
    updateCss();
    addEventListener('beforeunload', ()=>manager?.close());

    themeLoop();

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name: 'csss',
        callback: (args, value)=>showCssManager(),
        helpString: 'Show the CSS Snippet Manager.',
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name: 'csss-on',
        callback: (args, value)=>{
            const snippet = settings.snippetList.find(it=>it.name.toLowerCase() == value.toLowerCase());
            if (!snippet) {
                if (!isTrueFlag(args.quiet)) toastr.warning(`No such snippet: ${value}`);
                return '';
            }
            snippet.isDisabled = false;
            const sdm = snippetDomMapper.find(it=>it.snippet == snippet);
            if (sdm) {
                sdm.li.querySelector('.csss--isDisabled').checked = snippet.isDisabled;
            }
            snippet.save();
            return '';
        },
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({ name: 'quiet',
                description: 'no warning if snippet does not exist',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                defaultValue: 'false',
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({ description: 'name of the snippet to enable',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
                enumProvider: ()=>settings.snippetList.map(it=>new SlashCommandEnumValue(it.name)),
            }),
        ],
        helpString: 'Enable a CSS snippet.',
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name: 'csss-off',
        callback: (args, value)=>{
            const snippet = settings.snippetList.find(it=>it.name.toLowerCase() == value.toLowerCase());
            if (!snippet) {
                if (!isTrueFlag(args.quiet)) toastr.warning(`No such snippet: ${value}`);
                return '';
            }
            snippet.isDisabled = true;
            const sdm = snippetDomMapper.find(it=>it.snippet == snippet);
            if (sdm) {
                sdm.li.querySelector('.csss--isDisabled').checked = snippet.isDisabled;
            }
            snippet.save();
            return '';
        },
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({ name: 'quiet',
                description: 'no warning if snippet does not exist',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                defaultValue: 'false',
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({ description: 'name of the snippet to disable',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
                enumProvider: ()=>settings.snippetList.map(it=>new SlashCommandEnumValue(it.name)),
            }),
        ],
        helpString: 'Disable a CSS snippet.',
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name: 'csss-create',
        /**
         * @param {{name:string, disabled:string, global:string, theme:string}} args
         * @param {*} value
         */
        callback: (args, value)=>{
            createSnippet(args.name, value, {
                disabled: isTrueBoolean(args.disabled ?? 'false'),
                global: isTrueBoolean(args.global ?? 'true'),
                theme: isTrueBoolean(args.theme ?? 'false'),
            });
            return '';
        },
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({ name: 'name',
                description: 'name of the new snippet',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
            }),
            SlashCommandNamedArgument.fromProps({ name: 'disabled',
                description: 'whether the snippet is disabled',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                enumList: ['true', 'false'],
                defaultValue: 'false',
            }),
            SlashCommandNamedArgument.fromProps({ name: 'global',
                description: 'whether the snippet is global',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                enumList: ['true', 'false'],
                defaultValue: 'true',
            }),
            SlashCommandNamedArgument.fromProps({ name: 'theme',
                description: 'whether the snippet is for the current theme',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                enumList: ['true', 'false'],
                defaultValue: 'false',
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({ description: 'CSS content',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
            }),
        ],
        helpString: 'Create a new CSS snippet.',
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name: 'csss-delete',
        callback: (args, value)=>{
            const snippet = settings.snippetList.find(it=>it.name.toLowerCase() == value.toLowerCase());
            if (!snippet) {
                if (!isTrueFlag(args.quiet)) toastr.warning(`No such snippet: ${value}`);
                return '';
            }
            deleteSnippetByName(value);
            return '';
        },
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({ name: 'quiet',
                description: 'no warning if snippet does not exist',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                defaultValue: 'false',
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({ description: 'name of the snippet to delete',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
                enumProvider: ()=>settings.snippetList.map(it=>new SlashCommandEnumValue(it.name)),
            }),
        ],
        helpString: 'Delete a CSS snippet.',
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name: 'csss-get',
        callback: (args, value)=>{
            const snippet = settings.snippetList.find(it=>it.name.toLowerCase() == value.toLowerCase());
            if (!snippet) {
                if (!isTrueFlag(args.quiet)) toastr.warning(`No such snippet: ${value}`);
                return '';
            }
            if (isTrueFlag(args.all)) {
                return JSON.stringify(snippet);
            } else {
                return snippet.content;
            }
        },
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({ name: 'quiet',
                description: 'no warning if snippet does not exist',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                defaultValue: 'false',
            }),
            SlashCommandNamedArgument.fromProps({ name: 'all',
                description: 'get all snippet properties as a dictionary',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                defaultValue: 'false',
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({ description: 'name of the snippet to retrieve',
                isRequired: true,
                enumProvider: ()=>settings.snippetList.map(it=>new SlashCommandEnumValue(it.name)),
            }),
        ],
        returns: 'snippet content or dictionary with snippet properties',
        helpString: `
            <div>
                Retrieves a CSS snippet's content.
            </div>
            <div>
                Call with <code>all=</code> to retrieve all of the snippet's properties as a
                dictionary instead.
            </div>
            <div>
                <strong>Examples:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/csss-get My Snippet |\n/echo</code></pre>
                    </li>
                    <li>
                        <pre><code class="language-stscript">/csss-get all= My Snippet |\n/echo</code></pre>
                    </li>
                </ul>
            </div>
        `,
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name: 'csss-update',
        /**
         * @param {{name:string, disabled:string, global:string, theme:string}} args
         * @param {*} value
         */
        callback: (args, value)=>{
            const snippet = settings.snippetList.find(it=>it.name.toLowerCase() == args.name.toLowerCase());
            if (!snippet) {
                if (!isTrueFlag(args.quiet)) toastr.warning(`No such snippet: ${args.name}`);
                return '';
            }
            if (args.disabled !== undefined) {
                snippet.isDisabled = isTrueBoolean(args.disabled ?? 'false');
            }
            if (args.global !== undefined) {
                snippet.isGlobal = isTrueBoolean(args.global ?? 'true');
            }
            if (args.theme !== undefined) {
                if (isTrueBoolean(args.theme ?? 'false')) {
                    if (!snippet.themeList.includes(power_user.theme)) {
                        snippet.themeList.push(power_user.theme);
                        snippet.save();
                    }
                } else {
                    if (snippet.themeList.includes(power_user.theme)) {
                        snippet.themeList.splice(snippet.themeList.indexOf(power_user.theme), 1);
                        snippet.save();
                    }
                }
            }
            if (value?.trim()?.length) {
                snippet.content = value;
            }
            snippet.save();
            return '';
        },
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({ name: 'name',
                description: 'name of the snippet',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
                enumProvider: ()=>settings.snippetList.map(it=>new SlashCommandEnumValue(it.name)),
            }),
            SlashCommandNamedArgument.fromProps({ name: 'disabled',
                description: 'whether the snippet is disabled',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                enumList: ['true', 'false'],
                defaultValue: 'false',
            }),
            SlashCommandNamedArgument.fromProps({ name: 'global',
                description: 'whether the snippet is global',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                enumList: ['true', 'false'],
                defaultValue: 'true',
            }),
            SlashCommandNamedArgument.fromProps({ name: 'theme',
                description: 'whether the snippet is for the current theme',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                enumList: ['true', 'false'],
                defaultValue: 'false',
            }),
            SlashCommandNamedArgument.fromProps({ name: 'quiet',
                description: 'no warning if snippet does not exist',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                defaultValue: 'false',
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({ description: 'CSS content',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
            }),
        ],
        helpString: `
            <div>
                Update a CSS snippet.
            </div>
            <div>
                <strong>Examples:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/csss-update name="My Snippet" * { color: red; }</code></pre>
                    </li>
                    <li>
                        <pre><code class="language-stscript">/csss-update name="My Snippet" theme=true</code></pre>
                    </li>
                </ul>
            </div>
        `,
    }));
};
const themeLoop = async()=>{
    let theme = power_user.theme;
    let chat = getContext().characterId ?? getContext().groupId;
    while (true) {
        if (theme != power_user.theme || chat != (getContext().characterId ?? getContext().groupId)) {
            theme = power_user.theme;
            chat = getContext().characterId ?? getContext().groupId;
            updateCss();
            if (manager) {
                for (const snippet of settings.snippetList) {
                    /**@type {HTMLInputElement}*/(snippet.li.querySelector('.csss--isTheme')).checked = snippet.isTheme;
                    /**@type {HTMLInputElement}*/(snippet.li.querySelector('.csss--isChat')).checked = snippet.isChat;
                }
            }
        }
        await delay(500);
    }
};



/**@type {Settings} */
let settings;
/**@type {Window} */
let manager;
/**@type {HTMLElement} */
let snippetTemplate;
/**@type {HTMLStyleElement} */
let style;
/**@type {HTMLStyleElement} */
let managerStyle;
/**@type {Boolean} */
let isExporting = false;
/**@type {Object[]} */
let selectedList = [];
/**@type {HTMLElement} */
let selectedCount;
/**@type {HTMLElement} */
let expAll;
/**@type {{snippet:Snippet, li:HTMLElement}[]} */
let snippetDomMapper = [];
/**@type {HTMLElement} */
let collapser;
/**@type {HTMLElement} */
let list;
/**@type {Boolean} */
let hasFilesPlugin = false;

const sanitize = (css)=>{
    const style = document.createElement('style');
    style.innerHTML = css;
    document.head.append(style);
    const sheet = style.sheet;
    style.remove();
    return Array.from(sheet.cssRules).map(it=>(it.cssText) ?? '').join('\n');
};
const updateCss = ()=>{
    if (!style) {
        style = document.createElement('style');
        style.id = 'csss--css-snippets';
        document.head.append(style);
    }
    const snips = [];
    style.innerHTML = [
        '/*',
        ' * === GLOBAL SNIPPETS ===',
        ' */',
        sanitize(settings.snippetList
            .filter(it=>!snips.includes(it) && !it.isDisabled && it.isGlobal)
            .map(it=>(snips.push(it),`/* SNIPPET: ${it.name} */\n${it.content}`))
            .join('\n\n'),
        ),
        '\n\n\n\n',
        '/*',
        ' * === THEME SNIPPETS ===',
        ' */',
        sanitize(settings.snippetList
            ?.filter(it=>!snips.includes(it) && it.isTheme && (it.isChat || it.charList.length + it.groupList.length == 0) && !it.isDisabled)
            ?.map(it=>(snips.push(it),`/* SNIPPET: ${it.name} */\n${it.content}`))
            ?.join('\n\n'),
        ),
        '\n\n\n\n',
        '/*',
        ' * === CHAT SNIPPETS ===',
        ' */',
        sanitize(settings.snippetList
            ?.filter(it=>!snips.includes(it) && it.isChat && (it.isTheme || it.themeList.length == 0) && !it.isDisabled)
            ?.map(it=>(snips.push(it),`/* SNIPPET: ${it.name} */\n${it.content}`))
            ?.join('\n\n'),
        ),
    ].join('\n');
    if (managerStyle) {
        managerStyle.innerHTML = style.innerHTML;
    }
};

const updateExportSelection = ()=>{
    selectedCount.textContent = `${selectedList.length}`;
    const filtered = snippetDomMapper.filter(it=>!it.li.classList.contains('csss--isFiltered') && !it.li.classList.contains('csss--isHidden')).map(it=>it.snippet);
    const isAll = selectedList.length == settings.snippetList.length;
    const isFiltered = selectedList.length == filtered.length && !selectedList.find(it=>!filtered.includes(it));
    if (isFiltered && !isAll) {
        expAll.title = 'Select all snippets, including hidden / filtered';
    } else if (isAll) {
        expAll.title = 'Deselect all snippets';
    } else {
        expAll.title = 'Select all visible / unfiltered snippets';
    }
};

/**
 *
 * @param {Snippet} snippet
 */
const showThemes = (snippet) => {
    const blocker = document.createElement('div'); {
        blocker.classList.add('csss--blocker');
        const body = document.createElement('div'); {
            body.classList.add('csss--body');
            body.classList.add('csss--themes');
            body.classList.add('drawer-content');
            const head = document.createElement('div'); {
                head.classList.add('csss--themesHead');
                const h3 = document.createElement('h3'); {
                    h3.textContent = `Snippet: "${snippet.name}"`;
                    head.append(h3);
                }
                body.append(head);
            }
            const contentContainer = document.createElement('div'); {
                contentContainer.classList.add('csss--themesContent');
                const h4 = document.createElement('h4'); {
                    h4.textContent = 'Themes';
                    contentContainer.append(h4);
                }
                const content = document.createElement('div'); {
                    // content.classList.add('csss--themesContent');
                    const themes = [...document.querySelectorAll('#themes > option')].map(it=>it.textContent);
                    for (const theme of themes) {
                        const item = document.createElement('label'); {
                            item.classList.add('csss--themesItem');
                            const cb = document.createElement('input'); {
                                cb.type = 'checkbox';
                                cb.checked = snippet.themeList.includes(theme);
                                cb.addEventListener('click', ()=>{
                                    if (theme == power_user.theme) {
                                        const ogCb = snippetDomMapper.find(it=>it.snippet == snippet).li.querySelector('csss--isTheme');
                                        ogCb.click();
                                        cb.checked = ogCb.checked;
                                    } else {
                                        if (cb.checked) {
                                            if (!snippet.themeList.includes(theme)) {
                                                snippet.themeList.push(theme);
                                                snippet.save();
                                            }
                                        } else {
                                            if (snippet.themeList.includes(theme)) {
                                                snippet.themeList.splice(snippet.themeList.indexOf(theme), 1);
                                                snippet.save();
                                            }
                                        }
                                    }
                                });
                                item.append(cb);
                            }
                            const lbl = document.createElement('div'); {
                                lbl.textContent = theme;
                                item.append(lbl);
                            }
                            content.append(item);
                        }
                    }
                    let first = true;
                    for (const theme of snippet.themeList) {
                        if (!themes.includes(theme)) {
                            if (first) {
                                first = false;
                                content.append(document.createElement('hr'));
                            }
                            const item = document.createElement('label'); {
                                item.classList.add('csss--themesItem');
                                const cb = document.createElement('input'); {
                                    cb.type = 'checkbox';
                                    cb.checked = true;
                                    cb.addEventListener('click', ()=>{
                                        if (theme == power_user.theme) {
                                            const ogCb = snippetDomMapper.find(it=>it.snippet == snippet).li.querySelector('csss--isTheme');
                                            ogCb.click();
                                            cb.checked = ogCb.checked;
                                        } else {
                                            if (cb.checked) {
                                                if (!snippet.themeList.includes(theme)) {
                                                    snippet.themeList.push(theme);
                                                    snippet.save();
                                                }
                                            } else {
                                                if (snippet.themeList.includes(theme)) {
                                                    snippet.themeList.splice(snippet.themeList.indexOf(theme), 1);
                                                    snippet.save();
                                                }
                                            }
                                        }
                                    });
                                    item.append(cb);
                                }
                                const lbl = document.createElement('div'); {
                                    lbl.textContent = theme;
                                    item.append(lbl);
                                }
                                content.append(item);
                            }
                        }
                    }
                    contentContainer.append(content);
                }

                contentContainer.append(document.createElement('hr'));
                const h4Chats = document.createElement('h4'); {
                    h4Chats.textContent = 'Chats';
                    contentContainer.append(h4Chats);
                }
                const contentChats = document.createElement('div'); {
                    // contentChats.classList.add('csss--themesContent');
                    for (const char of snippet.charList) {
                        const item = document.createElement('label'); {
                            item.classList.add('csss--themesItem');
                            const cb = document.createElement('input'); {
                                cb.type = 'checkbox';
                                cb.checked = true;
                                cb.addEventListener('click', ()=>{
                                    if (char == characters[getContext().characterId]?.avatar) {
                                        const ogCb = snippetDomMapper.find(it=>it.snippet == snippet).li.querySelector('csss--isTheme');
                                        ogCb.click();
                                        cb.checked = ogCb.checked;
                                    } else {
                                        if (cb.checked) {
                                            if (!snippet.charList.includes(char)) {
                                                snippet.charList.push(char);
                                                snippet.save();
                                            }
                                        } else {
                                            if (snippet.charList.includes(char)) {
                                                snippet.charList.splice(snippet.charList.indexOf(char), 1);
                                                snippet.save();
                                            }
                                        }
                                    }
                                });
                                item.append(cb);
                            }
                            const lbl = document.createElement('div'); {
                                lbl.textContent = `Char: ${characters.find(it=>it.avatar == char)?.name ?? 'DELETED'} (${char})`;
                                item.append(lbl);
                            }
                            contentChats.append(item);
                        }
                    }
                    for (const char of snippet.groupList) {
                        const item = document.createElement('label'); {
                            item.classList.add('csss--themesItem');
                            const cb = document.createElement('input'); {
                                cb.type = 'checkbox';
                                cb.checked = true;
                                cb.addEventListener('click', ()=>{
                                    if (char == groups.find(it=>it.id == getContext().groupId)) {
                                        const ogCb = snippetDomMapper.find(it=>it.snippet == snippet).li.querySelector('csss--isTheme');
                                        ogCb.click();
                                        cb.checked = ogCb.checked;
                                    } else {
                                        if (cb.checked) {
                                            if (!snippet.groupList.includes(char)) {
                                                snippet.groupList.push(char);
                                                snippet.save();
                                            }
                                        } else {
                                            if (snippet.groupList.includes(char)) {
                                                snippet.groupList.splice(snippet.groupList.indexOf(char), 1);
                                                snippet.save();
                                            }
                                        }
                                    }
                                });
                                item.append(cb);
                            }
                            const lbl = document.createElement('div'); {
                                lbl.textContent = `Group: ${groups.find(it=>it.id == char)?.name ?? 'DELETED'} (${char})`;
                                item.append(lbl);
                            }
                            contentChats.append(item);
                        }
                    }
                    contentContainer.append(contentChats);
                }
                body.append(contentContainer);
            }
            const ok = document.createElement('button'); {
                ok.classList.add('csss--ok');
                ok.textContent = 'OK';
                ok.addEventListener('click', ()=>{
                    blocker.remove();
                });
                body.append(ok);
            }
            blocker.append(body);
        }
        manager.document.body.append(blocker);
    }
};
const expand = (snippet, ta) => {
    const blocker = document.createElement('div'); {
        blocker.classList.add('csss--blocker');
        const body = document.createElement('div'); {
            body.classList.add('csss--body');
            body.classList.add('csss--expand');
            body.classList.add('drawer-content');
            let synIn;
            const syn = document.createElement('pre'); {
                syn.classList.add('csss--contentSyntax');
                synIn = document.createElement('code'); {
                    synIn.classList.add('csss--contentSyntaxInner');
                    synIn.classList.add('hljs');
                    synIn.classList.add('language-css');
                    syn.append(synIn);
                }
                body.append(syn);
            }
            const inp = document.createElement('textarea'); {
                inp.classList.add('csss--input');
                inp.value = snippet.content;
                inp.spellcheck = false;
                inp.addEventListener('input', ()=>{
                    snippet.content = inp.value.trim();
                    ta.value = snippet.content;
                    snippet.save();
                });
                body.append(inp);
            }
            addTabSupport(inp);
            addSyntaxHighlight(inp, synIn, 'css');
            const ok = document.createElement('button'); {
                ok.classList.add('csss--ok');
                ok.textContent = 'OK';
                ok.addEventListener('click', ()=>{
                    blocker.remove();
                });
                body.append(ok);
            }
            blocker.append(body);
        }
        manager.document.body.append(blocker);
    }
};
/**
 * @param {Snippet} snippet
 */
const makeSnippetDom = (snippet)=>{
    let noSave = true;
    const li = /**@type {HTMLElement} */(snippetTemplate.cloneNode(true)); {
        li.snippet = snippet;
        snippet.li = li;
        snippetDomMapper.push({ snippet, li });
        li.setAttribute('data-csss', snippet.name);
        li.addEventListener('click', ()=>{
            if (!isExporting) return;
            li.classList.toggle('csss--selected');
            if (li.classList.contains('csss--selected')) {
                selectedList.push(snippet);
            } else {
                const idx = selectedList.indexOf(snippet);
                if (idx != -1) {
                    selectedList.splice(idx, 1);
                }
            }
            updateExportSelection();
        });
        const collapseToggle = li.querySelector('.csss--collapse');
        collapseToggle.addEventListener('click', ()=>{
            const result = li.classList.toggle('csss--isCollapsed');
            collapseToggle.classList[result ? 'add' : 'remove']('fa-angle-down');
            collapseToggle.classList[!result ? 'add' : 'remove']('fa-angle-up');
            snippet.isCollapsed = result;
            const uncol = settings.snippetList.filter(it=>!it.isCollapsed);
            if (uncol.length > 0) {
                collapser.classList.remove('fa-angles-down');
                collapser.classList.add('fa-angles-up');
                collapser.title = 'Collapse snippets';
            } else {
                collapser.classList.add('fa-angles-down');
                collapser.classList.remove('fa-angles-up');
                collapser.title = 'Uncollapse snippets';
            }
            if (!noSave) snippet.save();
        });
        if (snippet.isCollapsed) {
            collapseToggle.click();
        }
        /**@type {HTMLInputElement} */
        const name = li.querySelector('.csss--name'); {
            name.value = snippet.name;
            name.addEventListener('paste', (evt)=>evt.stopPropagation());
            name.addEventListener('input', ()=>{
                snippet.name = name.value.trim();
                li.setAttribute('data-csss', snippet.name);
                if (!noSave) snippet.save();
            });
        }
        /**@type {HTMLInputElement} */
        const isDisabled = li.querySelector('.csss--isDisabled'); {
            isDisabled.checked = snippet.isDisabled;
            isDisabled.addEventListener('click', ()=>{
                snippet.isDisabled = isDisabled.checked;
                if (!noSave) snippet.save();
            });
        }
        /**@type {HTMLInputElement} */
        const isGlobal = li.querySelector('.csss--isGlobal'); {
            isGlobal.checked = snippet.isGlobal;
            isGlobal.addEventListener('click', ()=>{
                snippet.isGlobal = isGlobal.checked;
                if (!noSave) snippet.save();
            });
        }
        /**@type {HTMLInputElement} */
        const isSynced = li.querySelector('.csss--isSynced'); {
            isSynced.checked = snippet.isSynced;
            isSynced.addEventListener('click', ()=>{
                snippet.isSynced = isSynced.checked;
                if (!noSave) snippet.save();
            });
        }
        /**@type {HTMLInputElement} */
        const isTheme = li.querySelector('.csss--isTheme'); {
            isTheme.checked = snippet.isTheme;
            isTheme.parentElement.classList[snippet.themeList.length ? 'add' : 'remove']('csss--isUsed');
            isTheme.addEventListener('click', ()=>{
                if (snippet.isTheme) {
                    snippet.themeList.splice(snippet.themeList.indexOf(power_user.theme), 1);
                } else {
                    snippet.themeList.push(power_user.theme);
                }
                if (!noSave) snippet.save();
                isTheme.parentElement.classList[snippet.themeList.length ? 'add' : 'remove']('csss--isUsed');
            });
        }
        /**@type {HTMLInputElement} */
        const isChat = li.querySelector('.csss--isChat'); {
            isChat.checked = snippet.isChat;
            isChat.parentElement.classList[snippet.charList.length + snippet.groupList.length ? 'add' : 'remove']('csss--isUsed');
            isChat.addEventListener('click', (evt)=>{
                if (getCurrentChatId() == null) return evt.preventDefault();
                if (snippet.isChat) {
                    if (getContext().characterId != null) {
                        snippet.charList.splice(snippet.charList.indexOf(characters[getContext().characterId].avatar), 1);
                    } else if (getContext().groupId != null) {
                        snippet.groupList.splice(snippet.groupList.indexOf(getContext().groupId), 1);
                    }
                } else {
                    if (getContext().characterId != null) {
                        snippet.charList.push(characters[getContext().characterId].avatar);
                    } else if (getContext().groupId != null) {
                        snippet.groupList.push(getContext().groupId);
                    }
                }
                isChat.parentElement.classList[snippet.charList.length + snippet.groupList.length ? 'add' : 'remove']('csss--isUsed');
                if (!noSave) snippet.save();
            });
        }
        /**@type {HTMLTextAreaElement} */
        const content = li.querySelector('.csss--content'); {
            content.value = snippet.content;
            content.addEventListener('paste', (evt)=>evt.stopPropagation());
            content.addEventListener('input', ()=>{
                snippet.content = content.value.trim();
                if (!noSave) snippet.save();
            });
        }
        /**@type {HTMLElement} */
        const contentSyntaxInner = li.querySelector('.csss--contentSyntaxInner');
        addTabSupport(content);
        addSyntaxHighlight(content, contentSyntaxInner, 'css');
        /**@type {HTMLElement} */
        const max = li.querySelector('.csss--max'); {
            max.addEventListener('click', ()=>{
                expand(snippet, content);
            });
        }
        /**@type {HTMLElement} */
        const ide = li.querySelector('.csss--ide'); {
            if (!hasFilesPlugin) ide.replaceWith(document.createElement('div'));
            else {
                ide.addEventListener('click', async()=>{
                    if (snippet.isWatching) {
                        console.log('[CSSS]', 'UNWATCHING');
                        await snippet.stopEditLocally();
                        return;
                    }
                    console.log('[CSSS]', 'WATCHING');
                    ide.classList.add('csss--isWatching');
                    content.disabled = true;
                    await snippet.editLocally();
                    content.disabled = false;
                    ide.classList.remove('csss--isWatching');
                });
            }
        }
        /**@type {HTMLElement} */
        const themes = li.querySelector('.csss--themes'); {
            themes.addEventListener('click', ()=>{
                showThemes(snippet);
            });
        }
        /**@type {HTMLElement} */
        const remove = li.querySelector('.csss--remove'); {
            remove.addEventListener('click', ()=>{
                if (manager.window.confirm('Are you sure you want to delete this CSS snippet?\n\nThis cannot be undone!')) {
                    deleteSnippet(snippet);
                }
            });
        }
    }
    noSave = false;
    return li;
};
/**
 *
 * @param {string} name
 * @param {string} content
 * @param {{disabled?:boolean, global?:boolean, theme?:boolean}} options
 */
const createSnippet = (name = null, content = null, { disabled, global, theme } = {})=>{
    const snippet = new Snippet(settings);
    if (name !== null) snippet.name = name;
    if (content !== null) snippet.content = content;
    snippet.isDisabled = disabled ?? false;
    snippet.isGlobal = global ?? true;
    if (theme ?? false) {
        if (!Object.keys(settings.themeSnippets).includes(power_user.theme)) {
            settings.themeSnippets[power_user.theme] = [];
        }
        settings.themeSnippets[power_user.theme].push(snippet.name);
    }
    settings.snippetList.push(snippet);
    if (manager) {
        const li = makeSnippetDom(snippet);
        list.append(li);
        li.scrollIntoView();
    }
    snippet.save();
};
const deleteSnippetByName = (name)=>{
    const snippet = settings.snippetList.find(it=>it.name == name);
    deleteSnippet(snippet);
};
/**
 *
 * @param {Snippet} snippet
 */
const deleteSnippet = (snippet)=>{
    snippet.isDeleted = true;
    settings.snippetList.splice(settings.snippetList.indexOf(snippet), 1);
    const sdm = snippetDomMapper.find(it=>it.snippet == snippet);
    if (sdm) {
        sdm.li?.remove();
        snippetDomMapper.splice(snippetDomMapper.indexOf(sdm), 1);
    }
    snippet.save();
};
const showCssManager = async()=>{
    if (manager) {
        manager.focus();
        return '';
    }
    while (snippetDomMapper.pop());
    manager = window.open(
        `${location.protocol}//${location.host}/scripts/extensions/third-party/SillyTavern-CssSnippets/html/manager.html`,
        'snippetManager',
        [
            'popup',
            'innerWidth=700',
            'innerHeight=500',
        ].join(','),
    );
    await new Promise(resolve=>{
        let isResolved = false;
        delay(2000).then(()=>{
            if (isResolved) return;
            console.log('[CSSS]', 'LOAD TIMEOUT');
            isResolved = true;
            // manager.window.alert(`Manager window load event timed out after 2 seconds.\n\nLet's try to continue anyways.`);
            resolve();
        });
        manager.addEventListener('load', (evt)=>{
            if (isResolved) return;
            console.log('[CSSS]', 'LOAD', evt);
            isResolved = true;
            resolve();
        });
    });
    let isUnloaded = false;
    manager.addEventListener('unload', (evt)=>{
        console.log('[CSSS]', 'UNLOAD (no action)', evt);
        isUnloaded = true;
        settings.snippetList.filter(it=>it.isWatching).forEach(it=>it.stopEditLocally());
    });
    if (!manager) return '';
    const setup = ()=>{
        manager.document.title = 'SillyTavern CSS Snippets';
        manager.document.head.parentElement.setAttribute('style', document.head.parentElement.getAttribute('style'));
        manager.document.body.classList.add('csss--body');
        const base = document.createElement('base');
        base.href = `${location.protocol}//${location.host}`;
        manager.document.head.append(base);
        // manager.document.body.innerHTML = '<h1>Loading...</h1>';
        Array.from(document.querySelectorAll('link[rel="stylesheet"]:not([href*="/extensions/"]), style')).forEach(it=>manager.document.head.append(it.cloneNode(true)));
        managerStyle = manager.document.querySelector('#csss--css-snippets');
    };
    setup();
    /**@type {HTMLElement} */
    const dom = manager.document.querySelector('#csss--root');
    // @ts-ignore
    manager.sortableStop = ()=>{
        // @ts-ignore
        settings.snippetList.sort((a,b)=>Array.from(list.children).findIndex(it=>it.snippet == a) - Array.from(list.children).findIndex(it=>it.snippet == b));
        saveSettingsDebounced();
    };
    // @ts-ignore
    manager.sortableDelay = getSortableDelay();
    const scripts = [
        '/lib/jquery-3.5.1.min.js',
        '/lib/jquery-ui.min.js',
    ];
    for (const s of scripts) {
        const response = await fetch(s);
        if (response.ok) {
            const script = manager.document.createElement('script');
            script.innerHTML = await response.text();
            dom.append(script);
        }
    }
    const sortableScript = manager.document.createElement('script');
    sortableScript.innerHTML = `
        $('#csss--list').sortable({
            delay: window.sortableDelay,
            stop: window.sortableStop,
        });
    `;
    dom.append(sortableScript);

    collapser = dom.querySelector('#csss--collapse');
    collapser.addEventListener('click', ()=>{
        const uncol = settings.snippetList.filter(it=>!it.isCollapsed);
        if (uncol.length > 0) {
            uncol.forEach(snippet=>snippetDomMapper.find(sdm=>sdm.snippet == snippet).li.querySelector('.csss--collapse').click());
        } else {
            settings.snippetList.forEach(snippet=>snippetDomMapper.find(sdm=>sdm.snippet == snippet).li.querySelector('.csss--collapse').click());
        }
    });
    // @ts-ignore
    snippetTemplate = dom.querySelector('#csss--snippet').content.querySelector('.csss--snippet');
    list = dom.querySelector('#csss--list');
    settings.snippetList.forEach(snippet=>{
        const li = makeSnippetDom(snippet);
        list.append(li);
    });
    /**@type {HTMLInputElement} */
    const imp = dom.querySelector('#csss--import-file');
    imp.addEventListener('input', async()=>{
        for (const file of imp.files) {
            try {
                importSnippets(await file.text());
            } catch { /* empty */ }
        }
    });
    const importSnippets = (text)=>{
        const snippets = [];
        try {
            snippets.push(...JSON.parse(text).map(it=>Snippet.from(settings, it)));
        } catch {
            // if not JSON, treat as plain CSS
            snippets.push(new Snippet(settings, text));
        }

        let jumped = false;
        for (const snippet of snippets) {
            try {
                settings.snippetList.push(snippet);
                const li = makeSnippetDom(snippet);
                list.append(li);
                if (!jumped) {
                    li.scrollIntoView();
                    jumped = true;
                }
            } catch { /* empty */ }
        }
        settings.save();
    };
    dom.querySelector('#csss--import').addEventListener('click', ()=>imp.click());
    dom.addEventListener('paste', (evt)=>{
        importSnippets(evt.clipboardData.getData('text'));
    });
    let exp = dom.querySelector('#csss--export');
    expAll = dom.querySelector('#csss--export-selectAll');
    let expMsg = dom.querySelector('#csss--export-message');
    let expCopy = dom.querySelector('#csss--export-copy');
    let expDownload = dom.querySelector('#csss--export-download');
    selectedCount = dom.querySelector('#csss--count');
    const stopExporting = ()=>{
        isExporting = false;
        dom.classList.remove('csss--isExporting');
        Array.from(dom.querySelectorAll('.csss--snippet.csss--selected')).forEach(it=>it.classList.remove('csss--selected'));
        while (selectedList.length > 0) selectedList.pop();
        [exp, expAll, expMsg, expCopy, expDownload].forEach(it=>it.classList.remove('csss--active'));
        updateExportSelection();
    };
    exp.addEventListener('click', ()=>{
        if (isExporting) {
            return stopExporting();
        }
        updateExportSelection();
        isExporting = true;
        dom.classList.add('csss--isExporting');
        [exp, expAll, expMsg, expCopy, expDownload].forEach(it=>it.classList.add('csss--active'));
    });
    expAll.addEventListener('click', ()=>{
        const filtered = snippetDomMapper.filter(it=>!it.li.classList.contains('csss--isFiltered') && !it.li.classList.contains('csss--isHidden')).map(it=>it.snippet);
        const isAll = selectedList.length == settings.snippetList.length;
        const isFiltered = selectedList.length == filtered.length && !selectedList.find(it=>!filtered.includes(it));
        if (isFiltered && !isAll) {
            // select all, including hidden snippets
            for (const snippet of settings.snippetList) {
                if (selectedList.includes(snippet)) continue;
                selectedList.push(snippet);
                snippetDomMapper.find(it=>it.snippet == snippet).li.classList.add('csss--selected');
            }
        } else if (isAll) {
            // unselect all snippets
            while (selectedList.length > 0) {
                const snippet = selectedList.pop();
                snippetDomMapper.find(it=>it.snippet == snippet).li.classList.remove('csss--selected');
            }
        } else {
            // select all visible / unfiltered snippets
            // first deselect all filtered snippets
            const deselect = [];
            for (const snippet of selectedList) {
                if (!filtered.includes(snippet)) deselect.push(snippet);
            }
            for (const snippet of deselect) {
                selectedList.splice(selectedList.indexOf(snippet), 1);
                snippetDomMapper.find(it=>it.snippet == snippet).li.classList.remove('csss--selected');
            }
            // then select missing snippets
            for (const snippet of filtered) {
                if (selectedList.includes(snippet)) continue;
                selectedList.push(snippet);
                snippetDomMapper.find(it=>it.snippet == snippet).li.classList.add('csss--selected');
            }
        }
        updateExportSelection();
    });
    expCopy.addEventListener('click', ()=>{
        if (!isExporting) return;
        if (selectedList.length > 0) {
            const ta = document.createElement('textarea'); {
                ta.value = JSON.stringify(selectedList);
                ta.style.position = 'fixed';
                ta.style.inset = '0';
                dom.append(ta);
                ta.focus();
                ta.select();
                try {
                    manager.document.execCommand('copy');
                } catch (err) {
                    console.error('Unable to copy to clipboard', err);
                }
                ta.remove();
            }
        }
        stopExporting();
    });
    expDownload.addEventListener('click', ()=>{
        if (!isExporting) return;
        if (selectedList.length > 0) {
            const blob = new Blob([JSON.stringify(selectedList)], { type:'text' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); {
                a.href = url;
                a.download = `SillyTavern-CSS-Snippets-${new Date().toISOString()}.json`;
                a.click();
            }
        }
        stopExporting();
    });

    /**@type {HTMLInputElement} */
    const search = dom.querySelector('#csss--searchQuery');
    search.title = [
        'Search snippets',
        '—'.repeat(30),
        'Default: search in snippet name',
        'Use a prefix to search in all or in specific fields.',
        '—'.repeat(30),
        'all:  search in name, content, theme',
        'content:  search in snippet content / CSS',
        'css:  alias for content:',
        'theme:  search in assigned themes',
        'name:  search in name (redundant, this is the default field to search in)',
        'title:  alias for name:',
    ].join('\n');
    search.addEventListener('input', ()=>{
        let fields = ['name', 'title', 'content', 'theme', 'css'];
        let query = search.value;
        if (search.value.startsWith('all:')) {
            query = search.value.slice(4).trim();
        } else if (fields.includes(search.value.split(':')[0])) {
            query = search.value.split(':').slice(1).join(':');
            fields = [search.value.split(':')[0]];
        }
        const re = new RegExp(query, 'i');
        for (const snippet of settings.snippetList) {
            const li = snippetDomMapper.find(it=>it.snippet == snippet).li;
            let found = false;
            for (const field of fields) {
                found = found || re.test(snippet[field]);
            }
            if (found) {
                li.classList.remove('csss--isHidden');
            } else {
                li.classList.add('csss--isHidden');
            }
        }
    });
    const applyFilter = ()=>{
        for (const snippet of settings.snippetList) {
            const li = snippetDomMapper.find(it=>it.snippet == snippet).li;
            if (
                (settings.filters.disabled && snippet.isDisabled)
                || (settings.filters.theme && !snippet.isTheme && snippet.themeList.length > 0)
                || (settings.filters.global && snippet.isGlobal)
                || (settings.filters.thisTheme && snippet.isTheme)
            ) {
                li.classList.add('csss--isFiltered');
            } else {
                li.classList.remove('csss--isFiltered');
            }
        }
        updateExportSelection();
    };
    applyFilter();
    const filterBtn = dom.querySelector('#csss--filter');
    let filterMenu;
    filterBtn.addEventListener('click', ()=>{
        if (filterMenu) {
            filterMenu.remove();
            filterMenu = null;
            return;
        }
        const rect = filterBtn.getBoundingClientRect();
        filterMenu = document.createElement('div'); {
            filterMenu.classList.add('csss--filterMenu');
            filterMenu.classList.add('list-group');
            filterMenu.style.top = `${rect.top + rect.height}px`;
            filterMenu.style.right = `${manager.innerWidth - rect.right}px`;
            [
                { key:'disabled', label:'Hide disabled snippets' },
                { key:'theme', label:'Hide snippets for other themes' },
                { key:'thisTheme', label:'Hide snippets for this theme' },
                { key:'global', label:'Hide global snippets' },
            ].forEach(filter=>{
                const item = document.createElement('label'); {
                    item.classList.add('csss--item');
                    item.title = filter.label;
                    const cb = document.createElement('input'); {
                        cb.type = 'checkbox';
                        cb.checked = settings.filters[filter.key];
                        cb.addEventListener('click', ()=>{
                            settings.filters[filter.key] = cb.checked;
                            settings.save();
                            applyFilter();
                        });
                        item.append(cb);
                    }
                    item.append(filter.label);
                    filterMenu.append(item);
                }
            });
            manager.document.body.append(filterMenu);
        }
    });

    const settingsBtn = dom.querySelector('#csss--settings');
    settingsBtn.addEventListener('click', ()=>{
        settings.toggle(dom);
    });

    dom.querySelector('.csss--add').addEventListener('click', ()=>createSnippet());

    if (isUnloaded) {
        console.log('[CSSS]', 'running setup again');
        setup();
    }
    manager.document.body.innerHTML = '';
    manager.document.body.append(dom);
    let onUnloadBound;
    const onUnload = (evt)=>{
        console.log('[CSSS]', 'UNLOAD', evt, evt.target.defaultView, evt.target.defaultView == manager);

        manager.removeEventListener('unload', onUnloadBound);
        manager = null;
    };
    onUnloadBound = onUnload.bind(this);
    manager.addEventListener('unload', onUnloadBound);
    return '';
};



/**
 *
 * @param {HTMLTextAreaElement} message
 */
const addTabSupport = (message)=>{
    message.addEventListener('keydown', async(evt) => {
        if (evt.key == 'Tab' && !evt.shiftKey && !evt.ctrlKey && !evt.altKey) {
            evt.preventDefault();
            const start = message.selectionStart;
            const end = message.selectionEnd;
            if (end - start > 0 && message.value.substring(start, end).includes('\n')) {
                const lineStart = message.value.lastIndexOf('\n', start);
                const count = message.value.substring(lineStart, end).split('\n').length - 1;
                message.value = `${message.value.substring(0, lineStart)}${message.value.substring(lineStart, end).replace(/\n/g, '\n\t')}${message.value.substring(end)}`;
                message.selectionStart = start + 1;
                message.selectionEnd = end + count;
                message.dispatchEvent(new Event('input', { bubbles:true }));
            } else {
                message.value = `${message.value.substring(0, start)}\t${message.value.substring(end)}`;
                message.selectionStart = start + 1;
                message.selectionEnd = end + 1;
                message.dispatchEvent(new Event('input', { bubbles:true }));
            }
        } else if (evt.key == 'Tab' && evt.shiftKey && !evt.ctrlKey && !evt.altKey) {
            evt.preventDefault();
            const start = message.selectionStart;
            const end = message.selectionEnd;
            const lineStart = message.value.lastIndexOf('\n', start);
            const count = message.value.substring(lineStart, end).split('\n\t').length - 1;
            message.value = `${message.value.substring(0, lineStart)}${message.value.substring(lineStart, end).replace(/\n\t/g, '\n')}${message.value.substring(end)}`;
            message.selectionStart = start - 1;
            message.selectionEnd = end - count;
            message.dispatchEvent(new Event('input', { bubbles:true }));
        }
    });
};

const addSyntaxHighlight = (message, messageSyntaxInner, language)=>{
    const updateScroll = () => {
        messageSyntaxInner.scrollTop = message.scrollTop;
        messageSyntaxInner.scrollLeft = message.scrollLeft;
    };
    const updateScrollDebounced = debounce(()=>updateScroll(), 0);

    message.addEventListener('input', () => {
        messageSyntaxInner.innerHTML = hljs.highlight(`${message.value}${message.value.slice(-1) == '\n' ? ' ' : ''}`, { language, ignoreIllegals:true })?.value;
        updateScrollDebounced();
    });
    message.addEventListener('scroll', ()=>{
        updateScrollDebounced();
    });
    message.style.color = 'transparent';
    message.style.background = 'transparent';
    message.style.setProperty('text-shadow', 'none', 'important');
    messageSyntaxInner.innerHTML = hljs.highlight(`${message.value}${message.value.slice(-1) == '\n' ? ' ' : ''}`, { language, ignoreIllegals:true })?.value;
};





init();
