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
              {/* TOP RIGHT: SOURCE (Placeholder for now) */}
              <div className="yat-front-top" style={{ justifyContent: 'flex-end' }}>
                <div className="yat-front-top-right">
                  <span className="front-chip">{a.source.toUpperCase()}</span>
                </div>
              </div>

              {/* BOTTOM SECTION: SPLIT INTO LEFT AND RIGHT QUADRANTS */}
              <div className="yat-news-bottom-wrap">
                {/* BOTTOM LEFT: PLAYER INFO & METADATA */}
                <div className="yat-info-block">
                  <div className="yat-name">
                    <span>{finalFirst || "--"}</span>
                    <span>{finalLast || ""}</span>
                  </div>
                  <div className="yat-meta">
                    <span>UCLA - Big 10 Conference</span>
                  </div>
                  <div className="yat-front-badge-row">
                    <span className="front-chip">{(a.level || 'PRO').toUpperCase()}</span>
                    <span className="front-chip">ACTIVE</span>
                  </div>
                  
                  <div className="yat-chips-col" style={{ marginTop: '4px' }}>
                    <span className="front-chip">CLASS OF 2023</span>
                    <div className="yat-dots" style={{ marginTop: '4px' }}>
                      <div className="yat-dot">23</div>
                      <div className="yat-dot">22</div>
                      <div className="yat-dot">21</div>
                      <div className="yat-dot">20</div>
                    </div>
                  </div>

                  <div className="yat-game-block" style={{ marginTop: '8px' }}>
                    <div className="yat-pill" style={{ background: '#00e676', color: '#000', border: 'none' }}>
                      FLIP TO READ RECAP <i className="ri-arrow-right-line" />
                    </div>
                    <div className="yat-game-text" style={{ fontSize: '10px', opacity: 0.7, marginTop: '4px' }}>
                      {a.source.toUpperCase()} ({dateStr})
                    </div>
                  </div>
                </div>

                {/* BOTTOM RIGHT: HEADLINE ANCHORED TO BASELINE */}
                <div className="yat-news-headline-wrap">
                  <div className="yat-news-headline">{a.title}</div>
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
        
        .yat-news-bottom-wrap {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          width: 100%;
          gap: 12px;
        }

        .yat-info-block {
          flex: 1;
          min-width: 0;
        }

        .yat-news-headline-wrap {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          min-width: 0;
          border-bottom: 2px solid #34495e; /* The blue baseline from mockup */
          padding-bottom: 4px;
        }

        .yat-news-headline {
          font-family: "Bebas Neue", sans-serif;
          font-size: 20px;
          line-height: 1.1;
          color: #fff;
          text-transform: uppercase;
          text-align: right;
          word-wrap: break-word;
        }

        .news-card :global(.yat-name) {
          font-size: 24px;
          line-height: 0.9;
        }
        @media(max-width: 1400px) { .news-card :global(.yat-name) { font-size: 22px; } }
        @media(max-width: 768px) { .news-card :global(.yat-name) { font-size: 20px; } }

        .news-card :global(.yat-meta) {
          font-size: 11px;
          line-height: 1.1;
          margin-top: 2px;
          opacity: 0.8;
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
