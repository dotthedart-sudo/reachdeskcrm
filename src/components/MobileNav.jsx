import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, FileText, Bell, Menu } from 'lucide-react';

export default function MobileNav({ onOpenMenu }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const navItems = [
    { icon: <LayoutDashboard size={20} />, label: 'Dashboard', path: '/' },
    { icon: <Users size={20} />, label: 'CRM', path: '/leads' },
    { icon: <FileText size={20} />, label: 'Templates', path: '/templates' },
    { icon: <Bell size={20} />, label: 'Reminders', path: '/reminders' },
    { icon: <Menu size={20} />, label: 'More', action: 'openMenu' },
  ];

  return (
    <div className="mobile-nav-bar">
      {navItems.map((item, index) => {
        const resolvedPath = item.path === '/' ? '/dashboard' : item.path;
        const isActive = item.path ? (pathname === resolvedPath || (item.path === '/' && pathname === '/')) : false;

        const handleClick = () => {
          if (item.action === 'openMenu') {
            onOpenMenu();
          } else if (item.path) {
            navigate(resolvedPath);
          }
        };

        return (
          <button
            key={index}
            onClick={handleClick}
            className={`mobile-nav-item ${isActive ? 'active' : ''}`}
            id={`mobile-nav-${item.label.toLowerCase()}`}
          >
            <span className="mobile-nav-icon">{item.icon}</span>
            <span className="mobile-nav-label">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
