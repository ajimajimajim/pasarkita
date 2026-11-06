// Builds the sidebar + top bar for logged-in pages and checks the user's role.
// Usage on a page:  const me = await Layout.init({ role: 'organizer', page: 'dashboard', title: 'Dashboard' });
const Layout = (() => {
  const MENUS = {
    organizer: [
      { page: 'dashboard', label: 'Dashboard', href: '/organizer/dashboard.html', icon: 'nav_map' },
      { page: 'events', label: 'Events', href: '/organizer/events.html', icon: 'nav_calendar' },
      { page: 'map-editor', label: 'Map Editor', href: '/organizer/map-editor.html', icon: 'nav_edit' },
      { page: 'requests', label: 'Requests', href: '/organizer/requests.html', icon: 'nav_inbox', badge: true },
      { page: 'vendors', label: 'Vendors', href: '/organizer/vendors.html', icon: 'nav_users' },
      { page: 'helpers', label: 'Helpers', href: '/organizer/helpers.html', icon: 'nav_helper' },
      { page: 'reports', label: 'Reports', href: '/organizer/reports.html', icon: 'nav_chart' },
      { page: 'profile', label: 'My Profile', href: '/organizer/profile.html', icon: 'nav_user' },
    ],
    vendor: [
      { page: 'dashboard', label: 'Dashboard', href: '/vendor/dashboard.html', icon: 'nav_map' },
      { page: 'applications', label: 'Applications', href: '/vendor/applications.html', icon: 'nav_list' },
      { page: 'next-event', label: 'Next Event', href: '/vendor/next-event.html', icon: 'nav_star' },
      { page: 'profile', label: 'My Profile', href: '/vendor/profile.html', icon: 'nav_user' },
    ],
  };

  async function init({ role, page, title }) {
    if (!Auth.token() || Auth.role() !== role) {
      location.href = '/login.html';
      return new Promise(() => {}); // stop the page script while redirecting
    }

    const items = MENUS[role].map((m) => `
      <a class="nav-item ${m.page === page ? 'active' : ''}" href="${m.href}">
        ${Sprites.svg(m.icon, 'nav-icon')}<span>${m.label}</span>
        ${m.badge ? '<span class="nav-badge hidden" id="navBadge"></span>' : ''}
      </a>`).join('');

    document.getElementById('sidebar').innerHTML = `
      <a class="brand" href="${Auth.home(role)}">${Sprites.svg('nav_store', 'brand-icon')}<span>Pasar<b>Kita</b></span></a>
      <div class="role-chip">${role === 'organizer' ? 'Organizer' : 'Vendor'}</div>
      <nav class="nav">${items}</nav>
      <div class="sidebar-foot">
        <a class="nav-item" href="/index.html">${Sprites.svg('nav_map', 'nav-icon')}<span>Public page</span></a>
        <button class="nav-item" id="logoutBtn">${Sprites.svg('nav_logout', 'nav-icon')}<span>Log out</span></button>
      </div>`;

    document.getElementById('topbar').innerHTML = `
      <button class="menu-toggle" id="menuToggle" aria-label="Open menu">&#9776;</button>
      <h1 class="page-title">${esc(title)}</h1>
      <div class="topbar-user"><span class="avatar">${esc((Auth.name() || '?').charAt(0).toUpperCase())}</span>
        <span class="user-name" id="userName">${esc(Auth.name() || '')}</span></div>`;
    document.title = `${title} · PasarKita`;

    document.getElementById('logoutBtn').onclick = () => { Auth.clear(); location.href = '/login.html'; };
    document.getElementById('menuToggle').onclick = () => document.body.classList.toggle('sidebar-open');
    document.getElementById('sidebarScrim')?.addEventListener('click', () => document.body.classList.remove('sidebar-open'));

    const me = await api('/auth/me');
    if (me.role !== role) { Auth.clear(); location.href = '/login.html'; }
    Auth.save(Auth.token(), me.role, me.name);
    document.getElementById('userName').textContent = me.name;
    if (role === 'organizer') refreshCounts();
    return me;
  }

  async function refreshCounts() {
    const el = document.getElementById('navBadge');
    if (!el) return null;
    try {
      const c = await api('/stats/counts');
      el.textContent = c.total;
      el.classList.toggle('hidden', !c.total);
      return c;
    } catch (e) { return null; }
  }

  return { init, refreshCounts };
})();
