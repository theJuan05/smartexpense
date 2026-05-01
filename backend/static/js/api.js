const API_BASE = window.location.origin + '/api';  // ← only this line changes

const API = {
  async request(endpoint, method = 'GET', body = null) {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (body) options.body = JSON.stringify(body);
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, options);
      const json = await response.json();
      return json;
    } catch (error) {
      console.warn(`[API] Request failed for ${endpoint}:`, error.message);
      return null;
    }
  },

  ping()            { return this.request('/ping'); },
  getExpenses()     { return this.request('/expenses'); },
  getAnalysis()     { return this.request('/analysis'); },
  postExpense(data) { return this.request('/expenses', 'POST', data); },

  categorize(title) {
    return this.request('/ai/categorize', 'POST', { title });
  },
  categorizeBatch(titles) {
    return this.request('/ai/categorize-batch', 'POST', { titles });
  },
};