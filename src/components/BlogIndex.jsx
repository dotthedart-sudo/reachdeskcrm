import { SiYoutube, SiInstagram } from '@icons-pack/react-simple-icons';
import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { siteMeta } from '../config/metadata';
import { generateOGTags } from '../config/metadata';
import { resolveBlogCover } from '../utils/blogCover';
import { useAppContext } from '../App';
import PublicNav from './PublicNav';
import '../styles/Blog.css';


const SiLinkedin = ({ size = 24, color = 'currentColor', ...props }) => (
  <svg role="img" viewBox="0 0 24 24" width={size} height={size} fill={color} {...props}>
    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.779-1.75-1.75s.784-1.75 1.75-1.75 1.75.779 1.75 1.75-.784 1.75-1.75 1.75zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
  </svg>
);
export default function BlogIndex() {
  const { theme } = useAppContext() || {};
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Dynamically load all blog post metadata
    // This scans the public/blog-posts.json file (which we'll create via sitemap script)
    loadBlogPosts();
  }, []);

  const loadBlogPosts = async () => {
    try {
      const response = await fetch('/blog-posts.json');
      const posts = await response.json();
      setPosts(posts);
    } catch (error) {
      console.error('Failed to load blog posts:', error);
      setPosts([]);
    }
    setLoading(false);
  };

  const pageTitle = siteMeta.pages.blog.title;
  const pageDescription = siteMeta.pages.blog.description;

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        {Object.entries(generateOGTags(pageTitle, pageDescription)).map(([key, value]) => (
          <meta key={key} property={key} content={value} />
        ))}
        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: 'ReachDesk CRM Blog',
            description: pageDescription,
            url: 'https://reachdeskcrm.com/blog',
          })}
        </script>
      </Helmet>

      <PublicNav />

      <div className="blog-container">
        <div className="blog-header">
          <h1>ReachDesk CRM Blog</h1>
          <p>Strategies for freelancers and agencies to never lose a lead</p>
        </div>

        {loading ? (
          <p>Loading posts...</p>
        ) : posts.length === 0 ? (
          <p>No blog posts yet. Check back soon!</p>
        ) : (
          <div className="blog-grid">
            {posts.map((post) => {
              const cover = resolveBlogCover(post, theme);
              return (
              <Link key={post.slug} to={`/blog/${post.slug}`} className="blog-card">
                {cover && (
                  <div className="blog-card-image">
                    <img src={cover} alt="" />
                  </div>
                )}
                <div className="blog-card-content">
                  <h2>{post.title.replace(/\s*—\s*/g, ' — ')}</h2>
                  <p>{post.description}</p>
                  <div className="blog-card-meta">
                    <span className="category">{post.category}</span>
                    <span className="date">
                      {new Date(post.publishedDate).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
              </Link>
              );
            })}
          </div>
        )}
      </div>

      <footer style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem', marginTop: '4rem', paddingBottom: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '16px' }}>
          <a href="https://www.youtube.com/@ReachDeskcrm" target="_blank" rel="noopener noreferrer" title="YouTube" style={{ color: 'var(--text-secondary)', transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}><SiYoutube size={20} /></a>
          <a href="https://www.instagram.com/reachdeskcrm/" target="_blank" rel="noopener noreferrer" title="Instagram" style={{ color: 'var(--text-secondary)', transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}><SiInstagram size={20} /></a>
          <a href="https://www.linkedin.com/company/reachdeskcrm/" target="_blank" rel="noopener noreferrer" title="LinkedIn" style={{ color: 'var(--text-secondary)', transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}><SiLinkedin size={20} /></a>
        </div>
        <p style={{ color: 'var(--text-secondary)' }}>© 2026 ReachDesk CRM. All rights reserved.</p>
      </footer>
    </>
  );
}
