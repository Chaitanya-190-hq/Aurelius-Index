/* ============================================================
   app.js — unsocial UI controller
   ------------------------------------------------------------
   Wires the five views to IndexedDB. All rendering is done with
   real DOM nodes and textContent, so user text is never parsed
   as HTML.
   ============================================================ */

import {
  MAX_LENGTH,
  cleanText,
  clearAll,
  collections,
  isAvailable,
  openDatabase,
  posts,
  requestPersistence,
  settings,
} from "./db.js";
import {
  exportBackup,
  importBackup,
  readBackupFile,
  validateBackup,
} from "./backup.js";
import {
  DEFAULT_CROP,
  ICON_PRESETS,
  NAME_PRESETS,
  applyIdentity,
  applyThemeColor,
  canInstall,
  generateIcons,
  getManifestBlobUrl,
  getManifestUrl,
  isStandalone,
  loadIdentity,
  normalizeIdentity,
  promptInstall,
  readImageFile,
  resetIdentity,
  resolveIcon,
  saveIdentity,
  setupInstallPrompt,
} from "./disguise.js";

/* ── Element shortcuts ───────────────────────────────────── */
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

/* ── Random thought bank (written into the app, no network) ── */
const THOUGHTS = {
  philosophical: [
    "You are the only person who has to live with every choice you make, which is either terrifying or freeing, depending on the day.",
    "Every version of you that could have existed is still arguing with the version that does.",
    "We spend the first half of life collecting expectations and the second half quietly putting them down.",
    "The self is less a statue than a habit — something you keep doing, not something you found.",
    "Meaning isn't discovered at the end of the search. It accumulates in the walking.",
    "You can be certain of almost nothing and still be kind, which is probably the point.",
    "Time doesn't heal things so much as make them smaller in the room.",
    "A person who is at peace with being wrong learns faster than one who needs to be right.",
    "Most of what we call personality is a set of decisions repeated until they stopped feeling like decisions.",
    "The things you avoid are rarely as heavy as the weight of avoiding them.",
    "You don't need to know who you are to act well. You find out by acting.",
    "Attention is the only currency that doesn't inflate.",
    "There is no rule that says your best years have to be behind you.",
    "Forgetting is not a failure of memory; it is what makes room for another day.",
    "What you forgive, you stop carrying. What you understand, you stop fearing.",
    "Every honest thought is a small act of courage, because someone could always disagree.",
    "Silence is not the absence of a position.",
    "We are all unreliable narrators of our own lives, which is why writing things down helps.",
    "Contentment is wanting what you have without pretending you don't want anything else.",
    "A boundary is not a wall. It's a door you know how to close.",
    "Nobody arrives. People just get better at the journey they're on.",
    "The clearest thinking happens before the story you tell yourself is finished.",
  ],
  funny: [
    "My to-do list has developed a personality and it's disappointed in me.",
    "I'm not procrastinating. I'm giving the task time to become urgent.",
    "I have a very specific talent for opening new tabs at the rate of one existential crisis per minute.",
    "Cleaned my desk. Found three pens, two receipts and a version of myself I'd like to apologise to.",
    "I told my plants I'd be more consistent. They're rooting for me.",
    "My phone battery and my social energy die at exactly the same time.",
    "Grocery shopping is just deciding which vegetables will decay in your fridge this week.",
    "I could be a morning person. I've just never been awake to confirm.",
    "Made a spreadsheet for my hobbies. Now the hobbies feel like a job I invented.",
    "The laundry chair is not furniture. It's a lifestyle.",
    "I don't have a sweet tooth. I have a sweet address and a full-time staff.",
    "My sleep schedule isn't bad, it's just experimenting with new time zones.",
    "Nothing says confidence like typing something into a search bar and then re-typing it more politely.",
    "I keep buying notebooks for the person I plan to become on Monday.",
    "The most productive thing I did today was imagine doing the thing.",
    "I've been told I have a great sense of direction. It's mostly luck and unearned confidence.",
    "Friendship is 90% sending each other things at 2am and 10% remembering birthdays.",
    "I'm at an age where a good night's sleep is a personality trait.",
    "I opened the fridge, looked inside, and closed it like it owed me an explanation.",
    "The gym called. I let it go to voicemail and now we're both awkward.",
    "My inner monologue has ads now.",
    "Somewhere in my house is the perfect pen I lost in 2019, and it is thriving.",
  ],
  weird: [
    "Every chair you've ever sat in remembers the shape of you, just a little.",
    "Somewhere in the world is a stranger wearing a shirt you lost and they think it's theirs now.",
    "There is a version of your voice that only exists in other people's memories.",
    "The last time you remembered a dream, you may have deleted a different one to make room.",
    "Your phone's clock has never once been exactly right. Only close.",
    "Every building is a promise that gravity will behave, renewed each morning.",
    "The gaps between your memories are longer than the memories themselves.",
    "You have never seen your own face in real time, only a version delayed by light.",
    "Somewhere a plant is quietly succeeding at something you gave up on.",
    "The number of doors you have walked through and forgotten is probably in the thousands.",
    "Somewhere on a hard drive, a photo of you exists that nobody remembers taking.",
    "You can't remember the name of the person whose handwriting you once envied.",
    "There's an entire city of people who are certain about a town you've never heard of.",
    "At any given moment, someone is hearing your favourite song for the first time and doesn't care.",
    "The word 'someday' is a place you've booked a room in but never visited.",
    "Your tongue sits in your mouth all day and you only notice when you read this sentence.",
    "Every map you've ever used has been a lie with good intentions.",
    "Half the objects in your home were chosen by a version of you who no longer exists.",
    "The longest conversation you've ever had is with yourself, and the ratings are mixed.",
    "There are lamps in your city that have been on for so long nobody remembers turning them on.",
  ],
  provoking: [
    "If nobody will ever read it, what would you write honestly?",
    "What opinion do you hold mainly because someone you respect holds it?",
    "You have a limited number of days and no idea how many. What's actually worth one?",
    "Would you still want the thing if you couldn't tell anyone you had it?",
    "What would change if you treated your attention as your most expensive possession?",
    "Who would you be if you'd never been praised for the thing you're best at?",
    "What are you pretending not to know?",
    "Is the thing you're chasing something you want, or something you want to have wanted?",
    "If your life were audited, what would the numbers say you love?",
    "What would you try if failing cost nothing but a weekend?",
    "Which of your beliefs would you defend in front of someone smarter than you?",
    "What are you keeping busy to avoid feeling?",
    "If you spoke to yourself the way you speak to a friend, what would be different by Friday?",
    "What's a decision you're postponing because both answers cost something?",
    "Who do you perform for, and are they even watching?",
    "What would you stop doing today if you knew nobody would notice?",
    "What part of your routine is a habit, and what part is a hiding place?",
    "If you could only keep one thing you've made this year, what would it be?",
    "What would you tell someone starting exactly where you started ten years ago?",
    "Is your comfort a place you live, or a place you're stuck?",
    "What's the kindest true thing you've never said out loud?",
    "When did you last change your mind about something that mattered?",
  ],
};

const CATEGORY_LABELS = {
  philosophical: "Philosophical",
  funny: "Funny",
  weird: "Weird",
  provoking: "Thought-provoking",
};

const ROUTES = {
  home: { eyebrow: "Journal", title: "Home" },
  saved: { eyebrow: "Library", title: "Saved" },
  discover: { eyebrow: "Generator", title: "Discover" },
  disguise: { eyebrow: "Identity", title: "Disguise Studio" },
  settings: { eyebrow: "Preferences", title: "Settings" },
};

/* ── State ───────────────────────────────────────────────── */
const state = {
  posts: [],
  collections: [],
  identity: null,
  theme: "system",
  route: "home",
  savedQuery: "",
  savedCollection: "all",
  promptCategory: "all",
  prompt: "",
  lastPrompt: "",
  editingId: null,
  iconSource: null,
  crop: { ...DEFAULT_CROP },
  pendingImport: null,
  ready: false,
};

/* ── Small utilities ─────────────────────────────────────── */

function toast(message, timeout = 3200) {
  const host = $("#toasts");
  if (!host) return;
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  host.appendChild(node);
  setTimeout(() => {
    node.classList.add("toast--out");
    setTimeout(() => node.remove(), 300);
  }, timeout);
  // Keep the queue short so toasts never stack up the screen.
  while (host.children.length > 3) host.firstElementChild.remove();
}

/** Promise-based confirm using the native <dialog>. */
function confirmAction({ title, text, acceptLabel = "Confirm", danger = true }) {
  const dialog = $("#confirm-dialog");
  const accept = $("#confirm-accept");
  $("#confirm-title").textContent = title;
  $("#confirm-text").textContent = text;
  accept.textContent = acceptLabel;
  accept.className = danger ? "btn btn--danger" : "btn btn--primary";
  dialog.showModal();
  return new Promise((resolve) => {
    const done = (value) => {
      dialog.close();
      accept.removeEventListener("click", onAccept);
      $("#confirm-cancel").removeEventListener("click", onCancel);
      dialog.removeEventListener("close", onClose);
      resolve(value);
    };
    const onAccept = (event) => { event.preventDefault(); done(true); };
    const onCancel = (event) => { event.preventDefault(); done(false); };
    const onClose = () => done(false);
    accept.addEventListener("click", onAccept);
    $("#confirm-cancel").addEventListener("click", onCancel);
    dialog.addEventListener("close", onClose, { once: true });
  });
}

/** Promise-based single-line text prompt, also built on <dialog>. */
function askText({ title, label, value = "", acceptLabel = "Save" }) {
  const dialog = document.createElement("dialog");
  dialog.className = "dialog";
  dialog.innerHTML = `
    <form method="dialog">
      <h2 class="dialog__title"></h2>
      <div class="field">
        <label class="field-label" for="ask-input"></label>
        <input class="input" id="ask-input" maxlength="40" />
      </div>
      <div class="dialog__actions">
        <button class="btn btn--ghost" value="cancel" type="submit">Cancel</button>
        <button class="btn btn--primary" id="ask-accept" value="ok" type="submit"></button>
      </div>
    </form>`;
  $(".dialog__title", dialog).textContent = title;
  $("label", dialog).textContent = label;
  $("#ask-accept", dialog).textContent = acceptLabel;
  const input = $("#ask-input", dialog);
  input.value = value;
  document.body.appendChild(dialog);
  dialog.showModal();
  input.focus();
  input.select();

  return new Promise((resolve) => {
    dialog.addEventListener("close", () => {
      const accepted = dialog.returnValue === "ok" && input.value.trim() !== "";
      const result = accepted ? input.value.trim() : null;
      dialog.remove();
      resolve(result);
    });
  });
}

function relativeTime(timestamp) {
  const diff = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "just now";
  if (diff < hour) {
    const value = Math.round(diff / minute);
    return `${value} min ago`;
  }
  if (diff < day) {
    const value = Math.round(diff / hour);
    return `${value} hour${value === 1 ? "" : "s"} ago`;
  }
  if (diff < 7 * day) {
    const value = Math.round(diff / day);
    return `${value} day${value === 1 ? "" : "s"} ago`;
  }
  return new Date(timestamp).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fullTime(timestamp) {
  return new Date(timestamp).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resolvedTheme() {
  if (state.theme === "light" || state.theme === "dark") return state.theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function collectionName(id) {
  return state.collections.find((collection) => collection.id === id)?.name ?? null;
}

/* ── Theme ───────────────────────────────────────────────── */

async function setTheme(choice, { persist = true } = {}) {
  state.theme = ["light", "dark", "system"].includes(choice) ? choice : "system";
  applyTheme();
  if (persist) await settings.set("theme", state.theme);
  if (state.identity) {
    // Theme colour lives in the manifest, so rebuild it too.
    applyIdentityEverywhere();
  }
}

function applyTheme() {
  const resolved = resolvedTheme();
  document.documentElement.dataset.theme = resolved;
  $$("[data-theme-choice]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.themeChoice === state.theme));
  });
  if (state.identity) applyThemeColor(state.identity, resolved);
}

/* ── Routing ─────────────────────────────────────────────── */

function currentRoute() {
  const hash = window.location.hash.replace(/^#\/?/, "").trim();
  return ROUTES[hash] ? hash : "home";
}

function showRoute(route, { focus = false } = {}) {
  state.route = route;
  const meta = ROUTES[route] ?? ROUTES.home;

  $$(".view").forEach((view) => {
    view.hidden = view.dataset.view !== route;
  });
  $$("[data-nav]").forEach((link) => {
    if (link.dataset.nav === route) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  $("#topbar-eyebrow").textContent = meta.eyebrow;
  $("#topbar-title").textContent = meta.title;

  if (route === "saved") renderSaved();
  if (route === "disguise") renderDisguise();
  if (route === "settings") renderSettings();

  window.scrollTo(0, 0);
  if (focus) $("#main").focus({ preventScroll: true });
}

function initRouter() {
  window.addEventListener("hashchange", () => {
    const route = currentRoute();
    if (route !== state.route) showRoute(route);
  });
  document.addEventListener("click", (event) => {
    const goto = event.target.closest("[data-goto]");
    if (goto) {
      window.location.hash = goto.dataset.goto;
    }
  });
  showRoute(currentRoute());
}

/* ── Feed rendering ──────────────────────────────────────── */

function buildPostCard(post, { savedContext = false } = {}) {
  const card = document.createElement("article");
  card.className = "post";
  card.dataset.id = post.id;

  const head = document.createElement("header");
  head.className = "post__head";

  const time = document.createElement("time");
  time.className = "post__time";
  time.dateTime = new Date(post.createdAt).toISOString();
  time.textContent = relativeTime(post.createdAt);
  time.title = fullTime(post.createdAt);
  head.appendChild(time);

  if (post.updatedAt && post.updatedAt - post.createdAt > 60_000) {
    const edited = document.createElement("span");
    edited.className = "post__time";
    edited.textContent = "· edited";
    head.appendChild(edited);
  }

  if (post.bookmarked) {
    const badge = document.createElement("span");
    badge.className = "post__badge";
    badge.textContent = collectionName(post.collectionId) || "Saved";
    head.appendChild(badge);
  }

  card.appendChild(head);

  if (state.editingId === post.id) {
    card.appendChild(buildEditor(post));
    return card;
  }

  const body = document.createElement("p");
  body.className = "post__text";
  body.textContent = post.text;
  card.appendChild(body);

  const foot = document.createElement("footer");
  foot.className = "post__foot";

  foot.appendChild(actionButton("Edit", "edit", post.id));
  foot.appendChild(
    actionButton(post.bookmarked ? "Unsave" : "Save", "bookmark", post.id, {
      active: post.bookmarked,
    })
  );

  if (savedContext && post.bookmarked) {
    const select = document.createElement("select");
    select.className = "post__select";
    select.setAttribute("aria-label", "Move to collection");
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "No collection";
    select.appendChild(none);
    for (const collection of state.collections) {
      const option = document.createElement("option");
      option.value = collection.id;
      option.textContent = collection.name;
      option.selected = collection.id === post.collectionId;
      select.appendChild(option);
    }
    select.addEventListener("change", () => moveToCollection(post.id, select.value || null));
    foot.appendChild(select);
  }

  const spacer = document.createElement("span");
  spacer.className = "spacer";
  foot.appendChild(spacer);
  foot.appendChild(actionButton("Delete", "delete", post.id, { danger: true }));

  card.appendChild(foot);
  return card;
}

function actionButton(label, action, id, { danger = false, active = false } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `post__action${danger ? " post__action--danger" : ""}${active ? " post__action--on" : ""}`;
  button.dataset.action = action;
  button.dataset.id = id;
  button.textContent = label;
  return button;
}

function buildEditor(post) {
  const wrapper = document.createElement("div");
  const area = document.createElement("textarea");
  area.className = "post__edit-area";
  area.maxLength = MAX_LENGTH;
  area.rows = 4;
  area.value = post.text;
  area.setAttribute("aria-label", "Edit thought");

  const counter = document.createElement("span");
  counter.className = "counter";
  counter.textContent = `${post.text.length} / ${MAX_LENGTH}`;
  area.addEventListener("input", () => {
    counter.textContent = `${area.value.length} / ${MAX_LENGTH}`;
  });

  const actions = document.createElement("div");
  actions.className = "row-actions";
  const save = document.createElement("button");
  save.type = "button";
  save.className = "btn btn--primary btn--sm";
  save.textContent = "Save changes";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "btn btn--ghost btn--sm";
  cancel.textContent = "Cancel";

  const commit = async () => {
    const text = cleanText(area.value);
    if (!text) {
      toast("A thought can't be empty.");
      area.focus();
      return;
    }
    try {
      await posts.update(post.id, { text });
      state.editingId = null;
      await refreshData();
      renderAll();
      toast("Thought updated.");
    } catch (error) {
      toast(error.message || "Couldn't update that thought.");
    }
  };

  save.addEventListener("click", commit);
  cancel.addEventListener("click", () => {
    state.editingId = null;
    renderAll();
  });
  area.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      commit();
    }
    if (event.key === "Escape") {
      state.editingId = null;
      renderAll();
    }
  });

  actions.append(save, cancel);
  wrapper.append(area, counter, actions);
  setTimeout(() => {
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  }, 0);
  return wrapper;
}

function renderFeed() {
  const list = $("#post-list");
  const empty = $("#post-empty");
  list.replaceChildren();

  for (const post of state.posts) {
    list.appendChild(buildPostCard(post));
  }
  empty.hidden = state.posts.length > 0;
  $("#post-count").textContent = `${state.posts.length} ${state.posts.length === 1 ? "thought" : "thoughts"}`;
}

/* ── Saved view ──────────────────────────────────────────── */

function renderSaved() {
  const chipsHost = $("#collection-chips");
  chipsHost.replaceChildren();

  const savedPosts = state.posts.filter((post) => post.bookmarked);
  const countFor = (id) => savedPosts.filter((post) => post.collectionId === id).length;

  const allWrap = document.createElement("div");
  allWrap.className = `chip-wrap${state.savedCollection === "all" ? " chip-wrap--on" : ""}`;
  const allButton = document.createElement("button");
  allButton.type = "button";
  allButton.className = `chip${state.savedCollection === "all" ? " chip--on" : ""}`;
  allButton.textContent = "All saved";
  allButton.addEventListener("click", () => {
    state.savedCollection = "all";
    renderSaved();
  });
  const allCount = document.createElement("span");
  allCount.className = "chip__count";
  allCount.textContent = String(savedPosts.length);
  allWrap.append(allButton, allCount);
  chipsHost.appendChild(allWrap);

  for (const collection of state.collections) {
    const active = state.savedCollection === collection.id;
    const wrap = document.createElement("div");
    wrap.className = `chip-wrap${active ? " chip-wrap--on" : ""}`;

    const button = document.createElement("button");
    button.type = "button";
    button.className = `chip${active ? " chip--on" : ""}`;
    button.textContent = collection.name;
    button.addEventListener("click", () => {
      state.savedCollection = collection.id;
      renderSaved();
    });

    const count = document.createElement("span");
    count.className = "chip__count";
    count.textContent = String(countFor(collection.id));

    const rename = document.createElement("button");
    rename.type = "button";
    rename.className = "chip-mini";
    rename.textContent = "✎";
    rename.title = `Rename ${collection.name}`;
    rename.setAttribute("aria-label", `Rename collection ${collection.name}`);
    rename.addEventListener("click", async (event) => {
      event.stopPropagation();
      const name = await askText({
        title: "Rename collection",
        label: "Collection name",
        value: collection.name,
      });
      if (!name) return;
      try {
        await collections.rename(collection.id, name);
        await refreshData();
        renderAll();
        toast("Collection renamed.");
      } catch (error) {
        toast(error.message);
      }
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "chip-mini";
    remove.textContent = "×";
    remove.title = `Delete ${collection.name}`;
    remove.setAttribute("aria-label", `Delete collection ${collection.name}`);
    remove.addEventListener("click", async (event) => {
      event.stopPropagation();
      const ok = await confirmAction({
        title: `Delete "${collection.name}"?`,
        text: "The thoughts inside stay in Saved — they just won't belong to a collection anymore.",
        acceptLabel: "Delete collection",
      });
      if (!ok) return;
      await collections.remove(collection.id);
      if (state.savedCollection === collection.id) state.savedCollection = "all";
      await refreshData();
      renderAll();
      toast("Collection deleted.");
    });

    wrap.append(button, count, rename, remove);
    chipsHost.appendChild(wrap);
  }

  const query = state.savedQuery.trim().toLowerCase();
  const visible = savedPosts
    .filter((post) => (state.savedCollection === "all" ? true : post.collectionId === state.savedCollection))
    .filter((post) => (query ? post.text.toLowerCase().includes(query) : true));

  const list = $("#saved-list");
  list.replaceChildren();
  for (const post of visible) list.appendChild(buildPostCard(post, { savedContext: true }));

  $("#saved-empty").hidden = visible.length > 0;
  $("#saved-list-title").textContent =
    state.savedCollection === "all"
      ? "All saved"
      : collectionName(state.savedCollection) ?? "All saved";
  $("#saved-count").textContent = `${visible.length} ${visible.length === 1 ? "thought" : "thoughts"}`;
}

/* ── Mutations ───────────────────────────────────────────── */

async function createPost(text, extra = {}) {
  try {
    const post = await posts.create(text, extra);
    await refreshData();
    renderAll();
    toast("Thought saved.");
    return post;
  } catch (error) {
    toast(error.message || "Couldn't save that thought.");
    return null;
  }
}

async function deletePost(id) {
  const ok = await confirmAction({
    title: "Delete this thought?",
    text: "It will be removed from this device for good. Export a backup first if you're unsure.",
    acceptLabel: "Delete thought",
  });
  if (!ok) return;
  await posts.remove(id);
  if (state.editingId === id) state.editingId = null;
  await refreshData();
  renderAll();
  toast("Thought deleted.");
}

async function toggleBookmark(id) {
  const post = state.posts.find((item) => item.id === id);
  if (!post) return;
  if (post.bookmarked) {
    await posts.update(id, { bookmarked: false, collectionId: null });
    await refreshData();
    renderAll();
    toast("Removed from Saved. The thought itself is untouched.");
  } else {
    await posts.update(id, { bookmarked: true });
    await refreshData();
    renderAll();
    toast("Saved. Find it under Saved.");
  }
}

async function moveToCollection(id, collectionId) {
  await posts.update(id, { bookmarked: true, collectionId });
  await refreshData();
  renderAll();
  toast(collectionId ? `Moved to ${collectionName(collectionId)}.` : "Moved out of any collection.");
}

/* ── Discover ────────────────────────────────────────────── */

function nextThought() {
  const categories =
    state.promptCategory === "all" ? Object.keys(THOUGHTS) : [state.promptCategory];
  const pool = categories.flatMap((category) => THOUGHTS[category]);
  let text = state.lastPrompt;
  let guard = 0;
  while (text === state.lastPrompt && guard < 20) {
    text = pool[Math.floor(Math.random() * pool.length)];
    guard += 1;
  }
  state.prompt = text;
  state.lastPrompt = text;

  $("#prompt-text").textContent = text;
  const category = categories[Math.floor(Math.random() * categories.length)];
  $("#prompt-category").textContent =
    state.promptCategory === "all" ? CATEGORY_LABELS[category] ?? "Thought" : CATEGORY_LABELS[state.promptCategory];
}

/* ── Disguise Studio ─────────────────────────────────────── */

function renderNamePresets() {
  const host = $("#name-presets");
  host.replaceChildren();
  for (const preset of NAME_PRESETS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.textContent = preset.label;
    button.addEventListener("click", () => {
      $("#identity-name").value = preset.displayName;
      $("#identity-short").value = preset.shortName;
      updateNamePreview();
    });
    host.appendChild(button);
  }
  const custom = document.createElement("button");
  custom.type = "button";
  custom.className = "chip";
  custom.textContent = "Custom name";
  custom.addEventListener("click", () => {
    $("#identity-name").value = "";
    $("#identity-short").value = "";
    updateNamePreview();
    $("#identity-name").focus();
  });
  host.appendChild(custom);
}

function updateNamePreview() {
  const typed = $("#identity-name").value.trim();
  const label = typed || state.identity?.displayName || "unsocial";
  $("#name-preview-label").textContent = label;
  $("#identity-short").placeholder = label.slice(0, 12);
}

function renderIconGrid() {
  const host = $("#icon-grid");
  host.replaceChildren();

  const options = [...ICON_PRESETS];
  const activeId = state.identity?.icon.type === "preset" ? state.identity.icon.id : null;

  for (const preset of options) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "icon-option";
    button.setAttribute("aria-pressed", String(preset.id === activeId));
    button.dataset.iconId = preset.id;
    const img = document.createElement("img");
    img.src = preset.src192;
    img.alt = "";
    img.width = 46;
    img.height = 46;
    img.loading = "lazy";
    const label = document.createElement("span");
    label.textContent = preset.label;
    button.append(img, label);
    button.addEventListener("click", () => selectPresetIcon(preset.id));
    host.appendChild(button);
  }

  if (state.identity?.icon.type === "custom") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "icon-option";
    button.setAttribute("aria-pressed", "true");
    const img = document.createElement("img");
    img.src = state.identity.icon.src192;
    img.alt = "";
    img.width = 46;
    img.height = 46;
    const label = document.createElement("span");
    label.textContent = "Your image";
    button.append(img, label);
    button.addEventListener("click", () => {
      if (state.iconSource) {
        $("#icon-tools").hidden = false;
        renderCropPreview();
      } else {
        toast("Upload the image again to adjust its crop — the original file isn't stored, only the generated icons.");
      }
    });
    host.appendChild(button);
  }
}

function renderIconPreviews() {
  const icon = resolveIcon(state.identity);
  const targets = [
    $("#icon-preview-rounded"),
    $("#icon-preview-square"),
    $("#icon-preview-launcher"),
    $("#name-preview-icon"),
    $("#brand-mark"),
  ];
  for (const node of targets) {
    if (node) node.src = icon.src192;
  }
  $("#icon-status").textContent = icon.label;
}

function renderDisguise() {
  if (!state.identity) return;
  $("#identity-name").value = state.identity.displayName;
  $("#identity-short").value = state.identity.shortName;
  $("#identity-color").value = state.identity.themeColor || effectiveHex();
  $("#identity-color-swatch").style.background = state.identity.themeColor || effectiveHex();
  updateNamePreview();
  renderIconGrid();
  renderIconPreviews();

  $("#manifest-url").textContent = showManifestUrl();
  $("#manifest-inspect").href = getManifestBlobUrl();
  $("#manifest-status").textContent = manifestStatusLabel(state.identity);
  $("#crop-zoom").value = String(state.identity.crop.zoom);
  $("#crop-fit").value = state.identity.crop.fit;
  $("#crop-x").value = String(state.identity.crop.x);
  $("#crop-y").value = String(state.identity.crop.y);
}

/** The stable manifest URL, minus the cache-busting version query. */
function showManifestUrl() {
  try {
    const url = new URL(getManifestUrl());
    return `${url.pathname}${url.search}`;
  } catch {
    return "manifest.webmanifest";
  }
}

function effectiveHex() {
  return resolvedTheme() === "dark" ? "#151517" : "#f7f4ec";
}

function manifestStatusLabel(identity) {
  const untouched =
    identity.displayName === "unsocial" &&
    identity.icon.type === "preset" &&
    identity.icon.id === "unsocial" &&
    !identity.themeColor;
  if (untouched) return "Default";
  return identity.icon.type === "custom" ? "Custom icon" : "Customised";
}

/** Push identity into the document, brand and studio UI. */
function applyIdentityEverywhere() {
  if (!state.identity) return;
  const theme = resolvedTheme();
  const applied = applyIdentity(state.identity, theme);

  $("#brand-name").textContent = state.identity.displayName;
  $("#brand-mark").src = applied.icon.src192;
  $("#name-preview-icon").src = applied.icon.src192;
  $("#name-preview-label").textContent = state.identity.displayName;
  $("#manifest-url").textContent = showManifestUrl();
  $("#manifest-inspect").href = applied.blobUrl;
  $("#identity-color-swatch").style.background = applied.color;
  $("#icon-status").textContent = resolveIcon(state.identity).label;
  $("#manifest-status").textContent = manifestStatusLabel(state.identity);
}

async function persistIdentity(patch, message) {
  state.identity = normalizeIdentity({ ...state.identity, ...patch });
  try {
    state.identity = await saveIdentity(state.identity);
    applyIdentityEverywhere();
    renderDisguise();
    renderIconGrid();
    renderIconPreviews();
    if (message) toast(message);
  } catch (error) {
    toast(error.message || "Couldn't save that change.");
  }
}

async function selectPresetIcon(id) {
  await persistIdentity({ icon: { type: "preset", id } }, "Icon updated. Reinstalling the app applies it to your home screen.");
}

async function handleIconUpload(file) {
  try {
    const { dataUrl } = await readImageFile(file);
    state.iconSource = dataUrl;
    state.crop = { ...DEFAULT_CROP };
    $("#icon-tools").hidden = false;
    $("#crop-zoom").value = "1";
    $("#crop-x").value = "0";
    $("#crop-y").value = "0";
    $("#crop-fit").value = "cover";
    await renderCropPreview();
    toast("Image loaded. Adjust the crop, then apply it.");
  } catch (error) {
    toast(error.message || "That image couldn't be used.");
  }
}

let cropTimer = null;
function scheduleCropPreview() {
  clearTimeout(cropTimer);
  cropTimer = setTimeout(renderCropPreview, 140);
}

/** Preview the *draft* crop on the studio previews without saving. */
async function renderCropPreview() {
  if (!state.iconSource) return;
  const crop = {
    fit: $("#crop-fit").value,
    zoom: Number($("#crop-zoom").value),
    x: Number($("#crop-x").value),
    y: Number($("#crop-y").value),
  };
  state.crop = crop;
  try {
    const { src192 } = await generateIcons(state.iconSource, crop);
    for (const node of [
      $("#icon-preview-rounded"),
      $("#icon-preview-square"),
      $("#icon-preview-launcher"),
      $("#name-preview-icon"),
      $("#brand-mark"),
    ]) {
      if (node) node.src = src192;
    }
  } catch (error) {
    toast(error.message || "Couldn't preview that image.");
  }
}

async function applyCrop() {
  if (!state.iconSource) {
    toast("Upload an image first.");
    return;
  }
  try {
    const crop = {
      fit: $("#crop-fit").value,
      zoom: Number($("#crop-zoom").value),
      x: Number($("#crop-x").value),
      y: Number($("#crop-y").value),
    };
    const { src192, src512 } = await generateIcons(state.iconSource, crop);
    await persistIdentity(
      {
        icon: { type: "custom", src192, src512, source: state.iconSource },
        crop,
      },
      "Custom icon generated at 192 and 512 pixels."
    );
    $("#icon-tools").hidden = false;
  } catch (error) {
    toast(error.message || "Couldn't generate icons from that image.");
  }
}

/* ── Settings & backup ───────────────────────────────────── */

function renderSettings() {
  $$("[data-theme-choice]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.themeChoice === state.theme));
  });
  $("#install-btn-settings").hidden = !canInstall() || isStandalone();
}

async function handleExport() {
  try {
    const { data } = await exportBackup();
    await settings.set("lastExport", Date.now());
    renderLastExport();
    toast(`Exported ${plural(data.posts.length, "thought")} and ${plural(data.collections.length, "collection")}.`, 4200);
  } catch (error) {
    toast(error.message || "Export failed.");
  }
}

async function renderLastExport() {
  const stamp = await settings.get("lastExport", null);
  $("#last-export").textContent = stamp ? fullTime(stamp) : "Never";
}

async function handleImportFile(file) {
  try {
    const raw = await readBackupFile(file);
    const result = validateBackup(raw);
    if (!result.ok) {
      toast(result.errors[0] || "That backup couldn't be read.", 5200);
      $("#import-summary").replaceChildren(
        paragraph("This file can't be imported:"),
        list(result.errors)
      );
      $("#import-merge").hidden = true;
      $("#import-replace").hidden = true;
      $("#import-dialog").showModal();
      return;
    }

    state.pendingImport = result.data;
    const summary = $("#import-summary");
    summary.replaceChildren(
      paragraph(
        `Backup from ${result.data.exportedAt ? new Date(result.data.exportedAt).toLocaleString() : "an unknown date"} ` +
          `(version ${result.data.backupVersion}).`
      ),
      paragraph(`${result.data.posts.length} thoughts and ${result.data.collections.length} collections.`),
      ...(result.warnings.length ? [paragraph("Things to know:"), list(result.warnings)] : [])
    );
    $("#import-merge").hidden = false;
    $("#import-replace").hidden = false;
    $("#import-dialog").showModal();
  } catch (error) {
    toast(error.message || "That file couldn't be imported.");
  }
}

function paragraph(text) {
  const node = document.createElement("p");
  node.textContent = text;
  return node;
}

function list(items) {
  const ul = document.createElement("ul");
  for (const item of items.slice(0, 8)) {
    const li = document.createElement("li");
    li.textContent = item;
    ul.appendChild(li);
  }
  return ul;
}

async function finishImport(mode) {
  const data = state.pendingImport;
  $("#import-dialog").close();
  if (!data) return;
  try {
    const result = await importBackup(data, mode);
    state.pendingImport = null;
    const [storedIdentity, storedTheme] = await Promise.all([
      settings.get("identity", null),
      settings.get("theme", state.theme),
    ]);
    state.identity = normalizeIdentity(storedIdentity);
    await setTheme(storedTheme, { persist: false });
    await refreshData();
    applyIdentityEverywhere();
    renderAll();
    toast(
      `Imported ${plural(result.postsAdded, "thought")} and ${plural(result.collectionsAdded, "collection")}` +
        (result.postsSkipped ? `, skipped ${result.postsSkipped} already present.` : "."),
      4600
    );
  } catch (error) {
    toast(error.message || "Import failed.");
  }
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/* ── Data refresh & global render ────────────────────────── */

async function refreshData() {
  const [postRows, collectionRows] = await Promise.all([posts.list(), collections.list()]);
  state.posts = postRows;
  state.collections = collectionRows;
}

function renderAll() {
  renderFeed();
  renderSaved();
  if (state.route === "disguise") renderDisguise();
}

/* ── Event wiring ────────────────────────────────────────── */

function bindEvents() {
  /* Composer */
  const composer = $("#composer");
  const input = $("#composer-input");
  const submit = $("#composer-submit");
  const counter = $("#composer-counter");

  const syncComposer = () => {
    const length = input.value.length;
    counter.textContent = `${length} / ${MAX_LENGTH}`;
    counter.classList.toggle("counter--warn", length > MAX_LENGTH - 60);
    submit.disabled = cleanText(input.value).length === 0;
  };
  input.addEventListener("input", syncComposer);
  input.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      composer.requestSubmit();
    }
  });
  composer.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = cleanText(input.value);
    if (!text) {
      toast("Write something first.");
      return;
    }
    const created = await createPost(text);
    if (created) {
      input.value = "";
      syncComposer();
      input.focus();
    }
  });
  $("#composer-inspire").addEventListener("click", () => {
    nextThought();
    input.value = state.prompt;
    syncComposer();
    input.focus();
    toast("A borrowed thought. Edit it before publishing.");
  });
  syncComposer();

  /* Feed & saved list actions (delegated) */
  document.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]");
    if (!action) return;
    const id = action.dataset.id;
    switch (action.dataset.action) {
      case "edit":
        state.editingId = state.editingId === id ? null : id;
        renderAll();
        break;
      case "delete":
        deletePost(id);
        break;
      case "bookmark":
        toggleBookmark(id);
        break;
      default:
        break;
    }
  });

  /* Saved view controls */
  $("#saved-search").addEventListener("input", (event) => {
    state.savedQuery = event.target.value;
    renderSaved();
  });
  $("#collection-new").addEventListener("click", () => {
    $("#collection-form").hidden = false;
    $("#collection-name").focus();
  });
  $("#collection-cancel").addEventListener("click", () => {
    $("#collection-form").hidden = true;
    $("#collection-name").value = "";
  });
  $("#collection-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const nameInput = $("#collection-name");
    try {
      const collection = await collections.create(nameInput.value);
      nameInput.value = "";
      $("#collection-form").hidden = true;
      await refreshData();
      renderAll();
      toast(`Collection "${collection.name}" created.`);
    } catch (error) {
      toast(error.message);
    }
  });

  /* Discover */
  $$("#prompt-chips [data-category]").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.promptCategory = chip.dataset.category;
      $$("#prompt-chips [data-category]").forEach((other) => {
        const on = other === chip;
        other.classList.toggle("chip--on", on);
        other.setAttribute("aria-selected", String(on));
      });
      nextThought();
    });
  });
  $("#prompt-next").addEventListener("click", nextThought);
  $("#prompt-save").addEventListener("click", async () => {
    if (!state.prompt) return;
    const created = await createPost(state.prompt);
    if (created) toast("Saved to your feed. Edit it there any time.");
  });

  /* Theme */
  $("#theme-toggle").addEventListener("click", () => {
    setTheme(resolvedTheme() === "dark" ? "light" : "dark");
  });
  $$("[data-theme-choice]").forEach((button) => {
    button.addEventListener("click", () => setTheme(button.dataset.themeChoice));
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (state.theme === "system") applyTheme();
  });

  /* Disguise — name */
  $("#identity-name").addEventListener("input", updateNamePreview);
  $("#identity-short").addEventListener("input", updateNamePreview);
  $("#identity-save").addEventListener("click", async () => {
    const displayName = $("#identity-name").value.trim();
    const shortName = $("#identity-short").value.trim();
    if (!displayName) {
      toast("A display name can't be empty.");
      $("#identity-name").focus();
      return;
    }
    await persistIdentity(
      { displayName: displayName.slice(0, 40), shortName: (shortName || displayName).slice(0, 12) },
      "Identity saved. Remove and reinstall the app to see the new name on your home screen."
    );
  });
  $("#identity-reset").addEventListener("click", async () => {
    const ok = await confirmAction({
      title: "Reset the disguise?",
      text: "The app name, icon and theme colour go back to the original unsocial identity. Your thoughts are untouched.",
      acceptLabel: "Reset identity",
    });
    if (!ok) return;
    state.identity = await resetIdentity();
    applyIdentityEverywhere();
    renderDisguise();
    toast("Identity reset to unsocial.");
  });

  /* Disguise — icons */
  $("#icon-upload").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await handleIconUpload(file);
  });
  $("#icon-reset").addEventListener("click", async () => {
    state.iconSource = null;
    $("#icon-tools").hidden = true;
    await persistIdentity(
      { icon: { type: "preset", id: "unsocial" }, crop: { ...DEFAULT_CROP } },
      "Icon reset to the original unsocial mark."
    );
  });
  $("#crop-apply").addEventListener("click", applyCrop);
  for (const id of ["#crop-zoom", "#crop-x", "#crop-y"]) {
    $(id).addEventListener("input", scheduleCropPreview);
  }
  $("#crop-fit").addEventListener("change", () => renderCropPreview());

  /* Disguise — manifest & colour */
  $("#manifest-refresh").addEventListener("click", async () => {
    await persistIdentity({}, "Manifest rebuilt from the current identity.");
  });
  $("#identity-color").addEventListener("input", async (event) => {
    const value = event.target.value;
    $("#identity-color-swatch").style.background = value;
    state.identity = normalizeIdentity({ ...state.identity, themeColor: value });
    applyIdentityEverywhere();
  });
  $("#identity-color").addEventListener("change", async (event) => {
    await persistIdentity({ themeColor: event.target.value }, "Theme colour updated.");
  });
  $("#identity-color-auto").addEventListener("click", async () => {
    await persistIdentity({ themeColor: null }, "Theme colour now follows your light/dark setting.");
    $("#identity-color").value = effectiveHex();
  });

  /* Settings — backup */
  $("#backup-export").addEventListener("click", handleExport);
  $("#backup-import").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await handleImportFile(file);
  });
  $("#import-cancel").addEventListener("click", () => {
    state.pendingImport = null;
    $("#import-dialog").close();
  });
  $("#import-merge").addEventListener("click", () => finishImport("merge"));
  $("#import-replace").addEventListener("click", async () => {
    const ok = await confirmAction({
      title: "Replace all local data?",
      text: "Every thought currently on this device will be deleted and replaced with the backup's contents.",
      acceptLabel: "Replace everything",
    });
    if (ok) await finishImport("replace");
  });

  /* Settings — wipe */
  $("#wipe-data").addEventListener("click", async () => {
    const ok = await confirmAction({
      title: "Delete everything?",
      text: "All thoughts, collections and settings will be erased from this browser. There is no undo.",
      acceptLabel: "Delete all data",
    });
    if (!ok) return;
    await clearAll();
    toast("All local data deleted.", 1800);
    setTimeout(() => window.location.reload(), 900);
  });

  /* Install */
  const install = async () => {
    if (!canInstall()) {
      toast("Use your browser menu → Add to Home screen to install this app.", 4600);
      return;
    }
    const choice = await promptInstall();
    if (choice.outcome === "accepted") toast("Installed. Launch it from your home screen.");
    else if (choice.outcome === "dismissed") toast("Install dismissed.");
  };
  $("#install-btn").addEventListener("click", install);
  $("#install-btn-settings").addEventListener("click", install);

}

/* ── Boot ────────────────────────────────────────────────── */

function showFatalError(message) {
  const banner = document.createElement("div");
  banner.className = "callout";
  const strong = document.createElement("strong");
  strong.textContent = "Storage isn't available";
  const text = document.createElement("p");
  text.textContent = `${message} unsocial keeps everything in this browser's IndexedDB. Try a normal (non-private) window, or allow site data for this page, then reload.`;
  banner.append(strong, text);
  $("#main").prepend(banner);
}

async function boot() {
  state.theme = await settings.get("theme", "system").catch(() => "system");
  applyTheme();

  if (!isAvailable()) {
    showFatalError("This browser has IndexedDB turned off.");
    return;
  }

  try {
    await openDatabase();
  } catch (error) {
    showFatalError(error.message || "The local database couldn't be opened.");
    return;
  }

  try {
    state.identity = await loadIdentity();
    await refreshData();
  } catch (error) {
    toast(error.message || "Couldn't read local data.");
    state.identity = normalizeIdentity(null);
  }

  bindEvents();
  renderNamePresets();
  applyIdentityEverywhere();
  renderAll();
  renderLastExport();
  initRouter();

  // Reveal install buttons once the browser says the app is installable.
  setupInstallPrompt(() => {
    const available = canInstall() && !isStandalone();
    $("#install-btn").hidden = !available;
    $("#install-btn-settings").hidden = !available;
  });
  const installable = canInstall() && !isStandalone();
  $("#install-btn").hidden = !installable;
  $("#install-btn-settings").hidden = !installable;

  requestPersistence();
  registerServiceWorker();

  state.ready = true;
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (window.location.protocol === "file:") {
    // Service workers require http(s). The app still works from file://,
    // minus offline caching and installation.
    return;
  }
  try {
    await navigator.serviceWorker.register("service-worker.js", { scope: "./" });
  } catch (error) {
    console.warn("Service worker registration failed:", error);
  }
}

// Expose a tiny debug hook for manual testing in the console.
window.unsocial = {
  get state() {
    return { ...state };
  },
  refresh: async () => {
    await refreshData();
    renderAll();
  },
};

boot();
