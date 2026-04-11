import axios from 'axios';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL });

api.interceptors.request.use((config) => {
  const stored = JSON.parse(localStorage.getItem('justus-auth') || '{}');
  const token  = stored?.state?.token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('justus-auth');
      window.location.href = '/auth';
    }
    return Promise.reject(err);
  }
);

// Auth
export const authAPI = {
  register: (data)  => api.post('/auth/register', data),
  login:    (data)  => api.post('/auth/login', data),
  me:       ()      => api.get('/auth/me'),
  logout:   ()      => api.post('/auth/logout'),
};

// Users
export const userAPI = {
  search:        (q)    => api.get(`/users/search?q=${q}`),
  getById:       (id)   => api.get(`/users/${id}`),
  updateProfile: (data) => api.put('/users/profile', data),
  uploadAvatar:  (form) => api.post('/users/avatar', form),
};

// Contacts
export const contactAPI = {
  getAll: ()     => api.get('/contacts'),
  add:    (id)   => api.post(`/contacts/add/${id}`),
};

// Conversations
export const conversationAPI = {
  getAll:       ()     => api.get('/conversations'),
  getById:      (id)   => api.get(`/conversations/${id}`),
  getOrCreate:  (uid)  => api.post('/conversations/get-or-create', { userId: uid }),
  markRead:     (id)   => api.put(`/conversations/${id}/read`),
};

// Messages
export const messageAPI = {
  getHistory: (convId, params) => api.get(`/messages/${convId}`, { params }),
  edit:       (msgId, content) => api.put(`/messages/${msgId}`, { content }),
  delete:     (msgId, deleteFor) => api.delete(`/messages/${msgId}`, { data: { deleteFor } }),
};

// Media
export const mediaAPI = {
  upload: (formData) => api.post('/media/upload', formData),
  delete: (publicId) => api.delete(`/media/${encodeURIComponent(publicId)}`),
};

// Invite
export const inviteAPI = {
  generate: ()      => api.post('/invite/generate'),
  getInfo:  (token) => api.get(`/invite/${token}`),
  accept:   (token) => api.post(`/invite/${token}/accept`),
};

export default api;
