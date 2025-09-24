export const api = {
  baseUrl: '',

  async getActiveTemplate() {
    const r = await fetch(`${this.baseUrl}/templates/active`);
    if (!r.ok) throw new Error('Failed to fetch template');
    return r.json();
  },

  async getBuildings() {
    const r = await fetch(`${this.baseUrl}/buildings`);
    if (!r.ok) throw new Error('Failed to fetch buildings');
    return r.json();
  },

  async getBuildingForm(id) {
    const r = await fetch(`${this.baseUrl}/buildings/${id}`);
    if (!r.ok) throw new Error('Failed to fetch form');
    return r.json();
  },

  async listVersions(id) {
    const r = await fetch(`${this.baseUrl}/buildings/${id}/versions`);
    if (!r.ok) throw new Error('Failed to fetch versions');
    return r.json();
  },

  async getVersion(id, versionId) {
    const r = await fetch(`${this.baseUrl}/buildings/${id}/versions/${versionId}`);
    if (!r.ok) throw new Error('Failed to fetch version');
    return r.json();
  },

  async getReview(id, etag) {
    const qs = etag ? `?since=${encodeURIComponent(etag)}` : '';
    const r = await fetch(`${this.baseUrl}/buildings/${id}/review${qs}`);
    if (!r.ok) throw new Error('Failed to fetch review');
    return r.json();
  },

  async save(id, data, dataVersion, etag) {
    const r = await fetch(`${this.baseUrl}/buildings/${id}/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(etag ? { 'If-Match': etag } : {})
      },
      body: JSON.stringify({ data, dataVersion })
    });
    if (!r.ok) throw new Error('Save failed');
    return r.json();
  },

  async publish(id, data, dataVersion, etag) {
    const post = async (dv) => {
      const r = await fetch(`${this.baseUrl}/buildings/${id}/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(etag ? { 'If-Match': etag } : {})
        },
        body: JSON.stringify({ data, dataVersion: dv, reason: 'ui-publish' })
      });
      if (r.status === 412) {
        const e = await r.json().catch(() => ({}));
        const nextDV = e?.current?.dataVersion;
        if (nextDV != null) return post(nextDV); // retry once with server DV
      }
      if (!r.ok) throw new Error('Publish failed');
      return r.json();
    };
    return post(dataVersion);
  },

  async uploadFile(id, fieldPath, file) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('fieldPath', fieldPath);
    const r = await fetch(`${this.baseUrl}/buildings/${id}/upload`, {
      method: 'POST',
      body: fd
    });
    if (!r.ok) throw new Error('Upload failed');
    return r.json();
  }
};
