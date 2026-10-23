// modals.ts — showModal/hideModal + all modal openers preserved from newtab.js
export function showModal(modalId: string): void {
  document.getElementById('modalOverlay')?.classList.add('active');
  document.querySelectorAll('.modal').forEach((m) => ((m as HTMLElement).style.display = 'none'));
  const target = document.getElementById(modalId);
  // flex, not block: .modal is a flex column so .modal-body can scroll
  if (target) target.style.display = 'flex';
}

export function hideModal(): void {
  document.getElementById('modalOverlay')?.classList.remove('active');
  document.querySelectorAll('.modal').forEach((m) => ((m as HTMLElement).style.display = 'none'));

  const groupName = document.getElementById('groupName') as HTMLInputElement | null;
  if (groupName) groupName.value = '';

  const collectionName = document.getElementById('collectionName') as HTMLInputElement | null;
  if (collectionName) collectionName.value = '';

  const collectionDescription = document.getElementById('collectionDescription') as HTMLTextAreaElement | null;
  if (collectionDescription) collectionDescription.value = '';

  const addLinkForm = document.getElementById('addLinkForm');
  if (addLinkForm) addLinkForm.style.display = 'none';
}

export function showGroupModal(): void {
  const colorBtns = document.querySelectorAll('.color-btn');
  colorBtns.forEach((b) => b.classList.remove('selected'));
  const randomIndex = Math.floor(Math.random() * colorBtns.length);
  if (colorBtns[randomIndex]) colorBtns[randomIndex].classList.add('selected');
  showModal('groupModal');
  document.getElementById('groupName')?.focus();
}

export function showCollectionModal(): void {
  import('./state.js').then(({ state }) => {
    const el = document.getElementById('collectionTabCount');
    if (el) el.textContent = `${state.selectedTabs.size} tabs selected`;
  });
  showModal('collectionModal');
  document.getElementById('collectionName')?.focus();
}

export function showSettingsModal(): void {
  import('./state.js').then(({ state }) => {
    showModal('settingsModal');
    const apiKey = document.getElementById('apiKey') as HTMLInputElement | null;
    if (apiKey) apiKey.value = state.settings.apiKey || '';
    const prov = (state.settings as unknown as { aiProvider?: string }).aiProvider || 'lunaroute';
    document.querySelectorAll('#aiProviderSegment .seg-btn').forEach(b => b.setAttribute('aria-pressed', (b as HTMLElement).dataset.value === prov ? 'true' : 'false'));
    const theme = state.hasExplicitThemePreference ? (state.settings.darkMode ? 'dark' : 'light') : 'system';
    document.querySelectorAll('#themeSegment .seg-btn').forEach(b => b.setAttribute('aria-pressed', (b as HTMLElement).dataset.value === theme ? 'true' : 'false'));
  });
}

export function setupModalListeners(): void {
  const overlay = document.getElementById('modalOverlay');
  if (!overlay) return;

  document.getElementById('closeGroupModal')?.addEventListener('click', () => hideModal());
  document.getElementById('cancelGroupBtn')?.addEventListener('click', () => hideModal());
  document.getElementById('confirmGroupBtn')?.addEventListener('click', async () => {
    const name = (document.getElementById('groupName') as HTMLInputElement)?.value || 'New Group';
    const colorBtn = document.querySelector('.color-btn.selected') as HTMLElement | null;
    const color = colorBtn?.dataset.color || (await import('./state.js')).getRandomColor();
    const { createGroup } = await import('./render.js');
    await createGroup(name, color);
    hideModal();
  });

  document.querySelectorAll('.color-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.color-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  document.getElementById('closeCollectionModal')?.addEventListener('click', () => hideModal());
  document.getElementById('cancelCollectionBtn')?.addEventListener('click', () => hideModal());
  document.getElementById('confirmCollectionBtn')?.addEventListener('click', async () => {
    const name = (document.getElementById('collectionName') as HTMLInputElement)?.value || '';
    const description = (document.getElementById('collectionDescription') as HTMLTextAreaElement)?.value || '';
    if (name) {
      const { saveCollection } = await import('./collections.js');
      await saveCollection(name, description);
      hideModal();
    } else {
      const { showToast } = await import('./toast.js');
      showToast('Please enter a collection name', 'error');
    }
  });

  document.getElementById('closeViewCollectionModal')?.addEventListener('click', () => hideModal());
  document.getElementById('closeViewCollectionBtn')?.addEventListener('click', () => hideModal());
  document.getElementById('copyCollectionBtn')?.addEventListener('click', async () => {
    const { copyCurrentCollection } = await import('./collections.js');
    await copyCurrentCollection();
  });
  document.getElementById('downloadCollectionBtn')?.addEventListener('click', async () => {
    const { downloadCurrentCollection } = await import('./collections.js');
    downloadCurrentCollection();
  });
  document.getElementById('reopenCollectionBtn')?.addEventListener('click', async () => {
    const { reopenCurrentCollection } = await import('./collections.js');
    await reopenCurrentCollection();
  });
  document.getElementById('deleteCollectionBtn')?.addEventListener('click', async () => {
    const { deleteCurrentCollection } = await import('./collections.js');
    await deleteCurrentCollection();
  });

  document.getElementById('addLinkBtn')?.addEventListener('click', async () => {
    const { showAddLinkForm } = await import('./collections.js');
    showAddLinkForm();
  });
  document.getElementById('cancelAddLinkBtn')?.addEventListener('click', async () => {
    const { hideAddLinkForm } = await import('./collections.js');
    hideAddLinkForm();
  });
  document.getElementById('confirmAddLinkBtn')?.addEventListener('click', async () => {
    const { addLinkToCurrentCollection } = await import('./collections.js');
    await addLinkToCurrentCollection();
  });

  document.getElementById('closeViewAllCollectionsModal')?.addEventListener('click', () => hideModal());
  document.getElementById('closeViewAllCollectionsBtn')?.addEventListener('click', () => hideModal());
  document.getElementById('copyAllCollectionsBtn')?.addEventListener('click', async () => {
    const { copyAllCollections } = await import('./collections.js');
    await copyAllCollections();
  });
  document.getElementById('downloadAllCollectionsBtn')?.addEventListener('click', async () => {
    const { downloadAllCollections } = await import('./collections.js');
    await downloadAllCollections();
  });

  document.getElementById('closeAddToCollectionModal')?.addEventListener('click', () => hideModal());
  document.getElementById('cancelAddToCollectionBtn')?.addEventListener('click', () => hideModal());

  document.getElementById('closeSettingsModal')?.addEventListener('click', () => hideModal());
  document.getElementById('cancelSettingsBtn')?.addEventListener('click', () => hideModal());
  // provider/theme segments
  document.querySelectorAll('#aiProviderSegment .seg-btn').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('#aiProviderSegment .seg-btn').forEach(b => b.setAttribute('aria-pressed', 'false'));
    btn.setAttribute('aria-pressed', 'true');
  }));
  document.querySelectorAll('#themeSegment .seg-btn').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('#themeSegment .seg-btn').forEach(b => b.setAttribute('aria-pressed', 'false'));
    btn.setAttribute('aria-pressed', 'true');
  }));
  document.getElementById('toggleApiKey')?.addEventListener('click', () => {
    const el = document.getElementById('apiKey') as HTMLInputElement | null;
    if (!el) return;
    el.type = el.type === 'password' ? 'text' : 'password';
  });

  document.getElementById('saveSettingsBtn')?.addEventListener('click', async () => {
    const apiKey = (document.getElementById('apiKey') as HTMLInputElement)?.value || '';
    const provBtn = document.querySelector('#aiProviderSegment .seg-btn[aria-pressed="true"]') as HTMLElement | null;
    const aiProvider = (provBtn?.dataset.value || 'lunaroute') as 'claude' | 'lunaroute';
    const themeBtn = document.querySelector('#themeSegment .seg-btn[aria-pressed="true"]') as HTMLElement | null;
    const theme = themeBtn?.dataset.value || 'system';
    const darkMode = theme === 'dark' ? true : theme === 'light' ? false : window.matchMedia('(prefers-color-scheme: dark)').matches;
    const { state } = await import('./state.js');
    const { Storage } = await import('../../shared/storage/index.js');
    const prevDarkMode = state.settings.darkMode;
    const isSystem = theme === 'system';
    state.settings = { apiKey, darkMode, aiProvider, hasExplicitThemePreference: isSystem ? false : true };
    if (!isSystem && darkMode !== prevDarkMode) state.hasExplicitThemePreference = true;
    await Storage.saveSettings(state.settings);
    if (darkMode) document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    const aiBtn = document.getElementById('aiOrganizeBtn') as HTMLButtonElement | null;
    if (aiBtn) aiBtn.disabled = !apiKey;
    hideModal();
  });

  document.getElementById('closeAiPreviewModal')?.addEventListener('click', () => hideModal());
  document.getElementById('cancelAiBtn')?.addEventListener('click', () => hideModal());
  document.getElementById('applyAiBtn')?.addEventListener('click', async () => {
    const { applyAISuggestions } = await import('./collections.js');
    await applyAISuggestions();
    hideModal();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hideModal();
  });
}
