// "My Profile" page for both organizer and vendor. The HTML page sets window.PROFILE_ROLE first.
(async () => {
  const role = window.PROFILE_ROLE;
  await Layout.init({ role, page: 'profile', title: 'My Profile' });
  const p = await api('/profile');

  const fields = role === 'organizer'
    ? `<div class="full"><label for="name">Name *</label><input type="text" id="name" name="name" required maxlength="120" value="${esc(p.name)}"></div>
       <div><label for="phone">Phone</label><input type="text" id="phone" name="phone" maxlength="30" value="${esc(p.phone || '')}"></div>
       <div><label for="email">Email</label><input type="email" id="email" name="email" maxlength="120" value="${esc(p.email || '')}"></div>`
    : `<div class="full"><label for="name">Business / owner name *</label><input type="text" id="name" name="name" required maxlength="120" value="${esc(p.name)}"></div>
       <div><label for="contactNumber">Phone *</label><input type="text" id="contactNumber" name="contactNumber" required maxlength="30" value="${esc(p.contact_number || '')}"></div>
       <div><label for="email">Email</label><input type="email" id="email" name="email" maxlength="120" value="${esc(p.email || '')}"></div>
       <div><label for="goodsType">What do you sell?</label><input type="text" id="goodsType" name="goodsType" maxlength="100" value="${esc(p.goods_type || '')}"></div>
       <div><label for="stallSizeRequired">Stall size you need</label><input type="text" id="stallSizeRequired" name="stallSizeRequired" maxlength="50" value="${esc(p.stall_size_required || '')}"></div>`;

  document.getElementById('profileBox').innerHTML = `
    <div class="grid-2" style="align-items:start">
      <div class="card">
        <div class="lot-head"><span class="avatar" style="width:52px;height:52px;font-size:1.5rem">${esc(p.name.charAt(0).toUpperCase())}</span>
          <div><h2 style="margin:0">${esc(p.name)}</h2><span class="muted small">@${esc(p.username)} · ${role === 'organizer' ? 'Organizer' : 'Vendor'}</span></div></div>
        <form id="profileForm" class="form-grid">${fields}
          <div class="full form-actions"><button class="btn" type="submit">Save profile</button></div>
        </form>
      </div>
      <div class="card">
        <h2>Change password</h2>
        <form id="pwForm">
          <label for="currentPassword">Current password</label><input type="password" id="currentPassword" name="currentPassword" required autocomplete="current-password">
          <label for="newPassword">New password</label><input type="password" id="newPassword" name="newPassword" required minlength="8" autocomplete="new-password">
          <label for="confirmPassword">Type new password again</label><input type="password" id="confirmPassword" name="confirmPassword" required minlength="8" autocomplete="new-password">
          <div class="form-actions"><button class="btn btn-ghost" type="submit">Change password</button></div>
        </form>
      </div>
    </div>`;

  document.getElementById('profileForm').onsubmit = async (e) => {
    e.preventDefault();
    await busy(e.target.querySelector('button'), async () => {
      try {
        await api('/profile', { method: 'PUT', body: formData(e.target) });
        const name = e.target.elements.name.value.trim();
        Auth.save(Auth.token(), role, name);
        document.getElementById('userName').textContent = name;
        toast('Profile saved.');
      } catch (err) { toast(err.message, 'error'); }
    });
  };

  document.getElementById('pwForm').onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    if (d.newPassword !== d.confirmPassword) { toast('The two new passwords do not match.', 'error'); return; }
    await busy(e.target.querySelector('button'), async () => {
      try {
        await api('/auth/password', { method: 'PUT', body: d });
        e.target.reset();
        toast('Password changed.');
      } catch (err) { toast(err.message, 'error'); }
    });
  };
})();
