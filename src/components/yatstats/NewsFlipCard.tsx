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

  const finalFirst = a.playerName ? a.playerName.split(" ").slice(0, -1).join(" ") : "";
  const finalLast = a.playerName ? a.playerName.split(" ").slice(-1).join(" ") : "";

  return (
    <article 
      className="yat-card news-card" 
      id={`news-${a.uuid}`}
      data-name={(a.playerName || '').toLowerCase()}
      data-status="ACTIVE"
      data-level={(a.level || '').toUpperCase()}
      data-org={(a.source || '').toUpperCase()}
    >
      <div className="yat-card-inner">
        <div className="yat-flip">
          
          {/* FRONT FACE */}
          <div className="yat-face yat-front" onClick={(e) => {
            const card = e.currentTarget.closest('.yat-card');
            if (card) card.classList.toggle('is-flipped');
          }}>
            <div 
              className="yat-bg" 
              style={{ backgroundImage: `url('${a.imageUrl || '/images/news-placeholder.jpg'}')` }}
            />
            <div className="yat-shade" />
            <div className="yat-front-content">
              <div className="yat-chips-col">
                <span className="front-chip">CLASS OF 2023</span>
              </div>
              
              <div className="yat-info-block">
                <div className="yat-name">
                  <span>{finalFirst || "--"}</span>
                  <span>{finalLast || ""}</span>
                </div>

                <div className="yat-meta">
                  <span>{a.title}</span>
                </div>
                
                <div className="yat-front-badge-row">
                  <span className="front-chip">{(a.level || 'PRO').toUpperCase()}</span>
                  <span className="front-chip">ACTIVE</span>
                </div>

                <div className="yat-game-block">
                  <div className="yat-pill">NEWS SOURCE</div>
                  <div className="yat-game-text">
                    <span>{a.source.toUpperCase()}</span>
                    <span>{dateStr}</span>
                  </div>
                </div>

                <div className="news-cta-row" style={{ marginTop: '8px' }}>
                  <div className="yat-pill" style={{ background: '#00e676', color: '#000', border: 'none' }}>
                    FLIP TO READ RECAP <i className="ri-arrow-right-line" />
                  </div>
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
                  <button onClick={(e) => { e.stopPropagation(); handleShare('x'); }} className="share-icon"><i className="ri-twitter-x-line" /></button>
                  <button onClick={(e) => { e.stopPropagation(); handleShare('fb'); }} className="share-icon"><i className="ri-facebook-fill" /></button>
                  <button onClick={(e) => { e.stopPropagation(); handleShare('email'); }} className="share-icon"><i className="ri-mail-line" /></button>
                  <button onClick={(e) => { e.stopPropagation(); handleShare('text'); }} className="share-icon"><i className="ri-chat-1-line" /></button>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
      
      <style jsx>{`
        .news-card {
          width: 100%;
          height: auto;
          position: relative;
        }
        .news-card :global(.yat-name) {
          font-size: 28px;
          line-height: 0.9;
        }
        @media(max-width: 1400px) { .news-card :global(.yat-name) { font-size: 26px; } }
        @media(max-width: 1100px) { .news-card :global(.yat-name) { font-size: 24px; } }
        @media(max-width: 768px) { .news-card :global(.yat-name) { font-size: 22px; } }

        .news-card :global(.yat-meta) {
          font-size: 13px;
          line-height: 1.1;
          margin-top: 4px;
          max-height: 2.4em;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
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
          color: #00e676;
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
          background: #00e676;
          color: #000;
          text-align: center;
          padding: 10px;
          font-family: 'Bebas Neue', sans-serif;
          text-decoration: none;
          margin-bottom: 16px;
          transition: all 0.2s;
          border-radius: 4px;
        }
        .news-full-story-btn:hover {
          opacity: 0.9;
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
          background: rgba(255,255,255,0.1);
          border: none;
          color: #fff;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.2s;
        }
        .share-icon:hover {
          background: rgba(255,255,255,0.2);
        }
      `}</style>
    </article>
  );
}
