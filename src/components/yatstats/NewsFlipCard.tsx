"use client";
// src/components/yatstats/NewsFlipCard.tsx
// Flip card for news articles in the news segment gallery.

import React from 'react';

interface NewsArticle {
  uuid: string;
  title: string;
  source: string;
  publishedAt: string;
  url: string;
  imageUrl: string | null;
  snippet: string | null;
  playerName: string | null;
  level: string | null;
  localRecap?: string | null;
}

interface NewsFlipCardProps {
  article: NewsArticle;
}

export default function NewsFlipCard({ article: a }: NewsFlipCardProps) {
  const dateStr = new Date(a.publishedAt).toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric'
  });

  const shareUrl = a.url;
  const shareTitle = `Check out this news about ${a.playerName || 'Hamilton Alumni'}: ${a.title}`;

  const handleShare = (platform: string) => {
    let url = '';
    switch (platform) {
      case 'x':
        url = `https://x.com/intent/tweet?text=${encodeURIComponent(shareTitle)}&url=${encodeURIComponent(shareUrl)}`;
        break;
      case 'fb':
        url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
        break;
      case 'email':
        url = `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(shareUrl)}`;
        break;
      case 'text':
        url = `sms:?&body=${encodeURIComponent(shareTitle + ' ' + shareUrl)}`;
        break;
    }
    if (url) window.open(url, '_blank');
  };

  return (
    <article className="yat-card news-card" id={`news-${a.uuid}`}>
      <div className="yat-card-inner">
        <div className="yat-flip">
          
          {/* FRONT FACE */}
          <div className="yat-face yat-front">
            <div 
              className="yat-bg" 
              style={{ backgroundImage: `url('${a.imageUrl || '/images/news-placeholder.jpg'}')` }}
            />
            <div className="yat-shade" />
            <div className="yat-front-content">
              <div className="yat-chips-col">
                <span className="front-chip">{a.source.toUpperCase()}</span>
                <span className="front-chip">{dateStr}</span>
              </div>
              
              <div className="yat-info-block">
                <div className="yat-name news-headline">
                  <span>{a.title}</span>
                </div>
                
                <div className="yat-front-badge-row">
                  {a.playerName && <span className="front-chip">{a.playerName.toUpperCase()}</span>}
                  {a.level && <span className="front-chip">{a.level}</span>}
                </div>

                <div className="news-cta-row">
                  <button className="news-flip-btn">
                    FLIP TO READ RECAP <i className="ri-arrow-right-line" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* BACK FACE */}
          <div className="yat-face yat-back">
            <div className="news-back-content">
              <div className="news-recap-header">
                <div className="news-recap-label">HAMILTON YAT?STATS RECAP</div>
                <div className="news-recap-title">{a.title}</div>
              </div>
              
              <div className="news-recap-body">
                {a.localRecap || a.snippet || "No recap available yet. Check back soon for the local Hamilton angle!"}
              </div>

              <div className="news-actions">
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="news-full-story-btn">
                  READ FULL STORY ON {a.source.toUpperCase()}
                </a>
                
                <div className="news-share-row">
                  <span className="share-label">SHARE:</span>
                  <button onClick={() => handleShare('x')} className="share-icon"><i className="ri-twitter-x-line" /></button>
                  <button onClick={() => handleShare('fb')} className="share-icon"><i className="ri-facebook-fill" /></button>
                  <button onClick={() => handleShare('email')} className="share-icon"><i className="ri-mail-line" /></button>
                  <button onClick={() => handleShare('text')} className="share-icon"><i className="ri-chat-1-line" /></button>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
      
      <style jsx>{`
        .news-card :global(.yat-name.news-headline) {
          font-size: clamp(18px, 4cqi, 24px);
          line-height: 1.1;
          margin-bottom: 12px;
          text-transform: uppercase;
        }
        .news-cta-row {
          margin-top: 16px;
        }
        .news-flip-btn {
          background: #ffc107;
          color: #000;
          border: none;
          padding: 8px 16px;
          font-family: 'Bebas Neue', sans-serif;
          font-size: 14px;
          letter-spacing: 1px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .news-back-content {
          padding: 20px;
          height: 100%;
          display: flex;
          flex-direction: column;
          background: #1a1a1a;
          color: #fff;
        }
        .news-recap-label {
          color: #ffc107;
          font-family: 'Bebas Neue', sans-serif;
          font-size: 12px;
          letter-spacing: 2px;
          margin-bottom: 4px;
        }
        .news-recap-title {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 18px;
          line-height: 1.2;
          margin-bottom: 16px;
          text-transform: uppercase;
        }
        .news-recap-body {
          font-size: 14px;
          line-height: 1.5;
          flex: 1;
          overflow-y: auto;
          margin-bottom: 20px;
          color: #ccc;
        }
        .news-full-story-btn {
          display: block;
          width: 100%;
          background: transparent;
          border: 1px solid #ffc107;
          color: #ffc107;
          text-align: center;
          padding: 10px;
          font-family: 'Bebas Neue', sans-serif;
          text-decoration: none;
          margin-bottom: 16px;
          transition: all 0.2s;
        }
        .news-full-story-btn:hover {
          background: #ffc107;
          color: #000;
        }
        .news-share-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .share-label {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 12px;
          color: #666;
        }
        .share-icon {
          background: none;
          border: none;
          color: #fff;
          font-size: 18px;
          cursor: pointer;
          padding: 0;
          transition: color 0.2s;
        }
        .share-icon:hover {
          color: #ffc107;
        }
      `}</style>
    </article>
  );
}
