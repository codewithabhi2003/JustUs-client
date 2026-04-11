import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Auth        from './pages/Auth';
import Chat        from './pages/Chat';
import Profile     from './pages/Profile';
import AcceptInvite from './pages/AcceptInvite';

const PrivateRoute = ({ children }) => {
  const { token } = useAuthStore();
  return token ? children : <Navigate to="/auth" replace />;
};

const App = () => (
  <Routes>
    <Route path="/auth"        element={<Auth />} />
    <Route path="/invite/:token" element={<AcceptInvite />} />
    <Route path="/" element={<PrivateRoute><Chat /></PrivateRoute>} />
    <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

export default App;
