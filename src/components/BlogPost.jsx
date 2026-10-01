import { SiYoutube, SiInstagram } from '@icons-pack/react-simple-icons';
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import ReactMarkdown from 'react-markdown';
import { generateOGTags } from '../config/metadata';
import { blogPostSchema } from '../utils/schemaMarkup';
import { resolveBlogCover } from '../utils/blogCover';
import { useAppContext } from '../App';
import PublicNav from './PublicNav';
import '../styles/Blog.css';


const SiLinkedin = ({ size = 24, color = 'currentColor', ...props }) => (
  <svg role="img" viewBox="0 0 24 24" width={size} height={size} fill={color} {...props}>
    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.779-1.75-1.75s.784-1.75 1.75-1.75 1.75.779 1.75 1.75-.784 1.75-1.75 1.75zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
  </svg>
);
export default function BlogPost() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { theme } = useAppContext() || {};
  const [post, setPost] = useState(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadPost();
  }, [slug]);

  const loadPost = async () => {
    try {
      // Step 1: Fetch metadata from blog-posts.json (built at build time)
      const indexResponse = await fetch('/blog-posts.json');
      const allPosts = await indexResponse.json();
      const postMetadata = allPosts.find((p) => p.slug === slug);

      if (!postMetadata) {
        throw new Error('Post not found');
      }

      // Step 2: Fetch markdown content
      const contentResponse = await fetch(`/blog-posts/${slug}.md`);
      if (!contentResponse.ok) throw new Error('Content not found');
      
      let markdown = await contentResponse.text();

      // Step 3: Strip frontmatter (--- ... ---)
      // Frontmatter is already parsed into blog-posts.json, so we remove it from content
      if (markdown.startsWith('---')) {
        const endIndex = markdown.indexOf('---', 3);
        if (endIndex !== -1) {
          markdown = markdown.substring(endIndex + 3).trim();
        }
      }
      markdown = markdown.replace(/\s*—\s*/g, ' — ');

      setPost(postMetadata);
      setContent(markdown);
    } catch (err) {
      setError(err.message);
      console.error('Failed to load post:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="blog-post-container"><p>Loading...</p></div>;
  if (error) return <div className="blog-post-container"><p>Error: {error}</p></div>;
  if (!post) return <div className="blog-post-container"><p>Post not found</p></div>;

  const displayCover = resolveBlogCover(post, theme);
  const ogCover = post.coverImage || displayCover;

  const schemaData = blogPostSchema({
    title: post.title,
    description: post.description,
    coverImage: ogCover,
    publishedDate: post.publishedDate,
    modifiedDate: post.modifiedDate,
    slug,
  });

  return (
    <>
      <Helmet>
        <title>{post.title} | ReachDesk CRM Blog</title>
        <meta name="description" content={post.description} />
        <meta name="keywords" content={post.keywords} />
        {Object.entries(generateOGTags(post.title, post.description, ogCover)).map(([key, value]) => (
          <meta key={key} property={key} content={value} />
        ))}
        <script type="application/ld+json">{JSON.stringify(schemaData)}</script>
      </Helmet>

      <PublicNav />

      <article className="blog-post-container">
        <div className="blog-post-header">
          <button onClick={() => navigate('/blog')} className="back-button">
            ← Back to Blog
          </button>
          <h1>{post.title}</h1>
          <p className="blog-post-description">{post.description}</p>
          <div className="blog-post-meta">
            <span className="category">{post.category}</span>
            <span className="date">
              {new Date(post.publishedDate).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
          </div>
        </div>

        {displayCover && (
          <div className="blog-post-image">
            <img src={displayCover} alt="" />
          </div>
        )}

        <div className="blog-post-content">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>

        <div className="blog-post-footer" style={{ display: 'flex', flexDirection: 'column', gap: '24px', alignItems: 'center', marginTop: '4rem' }}>
          <button onClick={() => navigate('/blog')} className="back-button" style={{ alignSelf: 'flex-start' }}>
            ← Back to Blog
          </button>
          
          <div style={{ display: 'flex', gap: '16px', marginTop: '16px' }}>
            <a href="https://www.youtube.com/@ReachDeskcrm" target="_blank" rel="noopener noreferrer" title="YouTube" style={{ color: 'var(--text-secondary)', transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}><SiYoutube size={20} /></a>
            <a href="https://www.instagram.com/reachdeskcrm/" target="_blank" rel="noopener noreferrer" title="Instagram" style={{ color: 'var(--text-secondary)', transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}><SiInstagram size={20} /></a>
            <a href="https://www.linkedin.com/company/reachdeskcrm/" target="_blank" rel="noopener noreferrer" title="LinkedIn" style={{ color: 'var(--text-secondary)', transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}><SiLinkedin size={20} /></a>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>© 2026 ReachDesk CRM. All rights reserved.</p>
        </div>
      </article>
    </>
  );
}
