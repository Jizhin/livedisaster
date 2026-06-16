import { Check, Eye, Flag, MessageSquare, ThumbsUp, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api, imageUrl } from "../api/client";
import { useLanguage } from "../i18n/LanguageContext";
import type { Comment, Report } from "../types";
import { timeAgo } from "../utils/time";

type VoteKind = "confirm" | "incorrect" | "resolved";

function getStoredVote(id: number): VoteKind | null {
  try { return localStorage.getItem(`kl_vote_${id}`) as VoteKind | null; }
  catch { return null; }
}
function storeVote(id: number, kind: VoteKind) {
  try { localStorage.setItem(`kl_vote_${id}`, kind); } catch { /* */ }
}

export function ReportDetailModal({
  report: initialReport,
  onClose,
  onUpdated,
}: {
  report: Report;
  related?: Report[];
  onClose: () => void;
  onUpdated?: (report: Report) => void;
}) {
  const { t, lang } = useLanguage();
  const [report,         setReport]         = useState<Report>(initialReport);
  const [activeImg,      setActiveImg]      = useState(0);
  const [voting,         setVoting]         = useState(false);
  const [myVote,         setMyVote]         = useState<VoteKind | null>(() => getStoredVote(initialReport.id));
  const [voteError,      setVoteError]      = useState<string | null>(null);
  const [commentText,    setCommentText]    = useState("");
  const [commentPosting, setCommentPosting] = useState(false);
  const [commentError,   setCommentError]   = useState<string | null>(null);

  useEffect(() => {
    const key = `kl_viewed_${report.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    api.viewReport(report.id)
      .then((updated) => setReport((prev) => ({ ...prev, views_count: updated.views_count })))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.id]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const updateReport = (updated: Report) => {
    setReport(updated);
    onUpdated?.(updated);
  };

  const handleVerify = async (kind: VoteKind) => {
    if (voting || myVote) return;
    setVoting(true); setVoteError(null);
    try {
      const counts = await api.verify(report.id, kind);
      storeVote(report.id, kind);
      setMyVote(kind);
      updateReport({ ...report, ...counts });
    } catch {
      setVoteError("Failed to submit. Please try again.");
    } finally {
      setVoting(false);
    }
  };

  const handleComment = async () => {
    if (!commentText.trim()) return;
    setCommentPosting(true); setCommentError(null);
    try {
      const updated = await api.addComment(report.id, { author_name: "Anonymous", content: commentText.trim() });
      setCommentText("");
      updateReport(updated);
    } catch {
      setCommentError("Failed to post. Please try again.");
    } finally {
      setCommentPosting(false);
    }
  };

  const isSafe         = report.content.toLowerCase().includes("[safe now]");
  const displayContent = report.content.replace(/^\[.*?\]\s*/, "").trim();
  const loc = report.locality
    ? `${report.locality}, ${report.district_name || "Kerala"}`
    : report.district_name || "Kerala";

  const statusKey =
    report.status === "resolved" ? "resolved" :
    report.status === "verified" ? "verified" :
    report.status === "disputed" ? "disputed" :
    isSafe ? "safe" : "active";

  /* Badge label — same style as district page cards */
  const badgeLabel =
    statusKey === "active"   ? "ALERT" :
    statusKey === "safe"     ? "SAFE UPDATE" :
    statusKey === "verified" ? "VERIFIED" :
    statusKey === "resolved" ? "RESOLVED" :
    "DISPUTED";

  const comments = report.comments as Comment[] | undefined;

  const timeline = [
    { dot: "green",  label: t.reportCreatedEv,  sub: t.reportCreatedSub,   time: report.created_at  },
    ...(report.confirmed_count > 0
      ? [{ dot: "blue",  label: `${report.confirmed_count} ${t.confirmationsRcvd}`, sub: t.confirmationsRcvdSub, time: report.updated_at }]
      : []),
    ...(report.images.length > 1
      ? [{ dot: "amber", label: t.photoAddedEv, sub: t.photoAddedSub, time: report.updated_at }]
      : []),
    ...(report.status === "resolved" || report.resolved_count > 0
      ? [{ dot: "grey",  label: t.issueResolvedEv, sub: t.issueResolvedSub, time: report.updated_at }]
      : []),
  ];

  return (
    <div className="rdm-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rdm-modal" role="dialog" aria-modal="true">

        <button className="rdm-close" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>

        {/* ── HEADER ── */}
        <div className="rdm-header">
          <div className="rdm-header-top">
            <span className={`rdm-badge rdm-badge--${statusKey}`}>{badgeLabel}</span>
            <h2 className="rdm-title">{displayContent}</h2>
            <div className="rdm-meta-row">
              <span className="rdm-loc">📍 {loc}</span>
              <span className="rdm-sep">·</span>
              <span>{timeAgo(report.created_at, lang)}</span>
              {report.reporter_name && (
                <><span className="rdm-sep">·</span><span>{report.reporter_name}</span></>
              )}
            </div>
          </div>
          <div className="rdm-metrics">
            <div className="rdm-metric">
              <Eye size={12} />
              <strong>{report.views_count ?? 0}</strong>
              <span>{t.viewsLabel}</span>
            </div>
            <div className="rdm-metric">
              <ThumbsUp size={12} />
              <strong>{report.confirmed_count}</strong>
              <span>{t.confirmedWord}</span>
            </div>
            <div className="rdm-metric">
              <MessageSquare size={12} />
              <strong>{report.comment_count}</strong>
              <span>{t.commentsWord}</span>
            </div>
            <div className="rdm-metric">
              <Flag size={12} />
              <strong>{report.resolved_count}</strong>
              <span>{t.resolvedFilter}</span>
            </div>
          </div>
        </div>

        {/* ── BODY ── */}
        <div className="rdm-body">

          {/* ── Left: image + description + verify ── */}
          <div className="rdm-left">

            {report.images.length > 0 && (
              <div className="rdm-media">
                <div
                  className="rdm-featured"
                  onClick={() => window.open(imageUrl(report.images[activeImg].file_path), "_blank")}
                >
                  <img src={imageUrl(report.images[activeImg].file_path)} alt={displayContent} />
                  <span className="rdm-featured-hint">{t.clickFullSize}</span>
                </div>
                {report.images.length > 1 && (
                  <div className="rdm-gallery">
                    {report.images.map((img, i) => (
                      <div
                        key={img.id}
                        className={`rdm-thumb${i === activeImg ? " rdm-thumb--on" : ""}`}
                        onClick={() => setActiveImg(i)}
                      >
                        <img src={imageUrl(img.file_path)} alt="" />
                      </div>
                    ))}
                    {report.images.length > 5 && (
                      <div className="rdm-thumb rdm-thumb--more">+{report.images.length - 5}</div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="rdm-section">
              <h3 className="rdm-section-hd">{t.descriptionSection}</h3>
              <p className="rdm-desc">{displayContent}</p>
            </div>

            <div className="rdm-section">
              <h3 className="rdm-section-hd">{t.communityStatusHd}</h3>
              {myVote ? (
                <div className="rdm-voted">
                  <Check size={13} />
                  {t.votedThanks} <strong>{myVote}</strong> {t.thanksCommunity}
                </div>
              ) : (
                <div className="rdm-pills">
                  <button className="rdm-pill rdm-pill--confirm" onClick={() => handleVerify("confirm")} disabled={voting}>
                    <ThumbsUp size={13} /> {t.confirm} ({report.confirmed_count})
                  </button>
                  <button className="rdm-pill rdm-pill--incorrect" onClick={() => handleVerify("incorrect")} disabled={voting}>
                    <X size={13} /> {t.incorrect} ({report.incorrect_count})
                  </button>
                  <button className="rdm-pill rdm-pill--resolved" onClick={() => handleVerify("resolved")} disabled={voting}>
                    <Flag size={13} /> {t.resolvedV} ({report.resolved_count})
                  </button>
                </div>
              )}
              {voteError && <p className="rdm-err">{voteError}</p>}
            </div>
          </div>

          {/* ── Right: discussion + activity + composer ── */}
          <div className="rdm-right">

            <div className="rdm-section">
              <h3 className="rdm-section-hd">{t.discussionHd} ({report.comment_count})</h3>
              <div className="rdm-comments">
                {!comments || comments.length === 0 ? (
                  <p className="rdm-no-comments">{t.noCommentsYet}</p>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="rdm-comment">
                      <div className="rdm-comment-body">
                        <div className="rdm-comment-hd">
                          <span className="rdm-comment-name">
                            {c.author_name && c.author_name !== "Community Member" ? c.author_name : "Anonymous"}
                          </span>
                          <span className="rdm-comment-time">{timeAgo(c.created_at)}</span>
                        </div>
                        <p className="rdm-comment-text">{c.content}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rdm-section">
              <h3 className="rdm-section-hd">{t.activityTimelineHd}</h3>
              <div className="rdm-tl">
                {timeline.map((ev, i) => (
                  <div key={i} className="rdm-tl-item">
                    <div className={`rdm-tl-dot rdm-tl-dot--${ev.dot}`} />
                    <div className="rdm-tl-body">
                      <span className="rdm-tl-label">{ev.label}</span>
                      <span className="rdm-tl-sub">{ev.sub}</span>
                      <span className="rdm-tl-time">{timeAgo(ev.time)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rdm-composer">
              <h3 className="rdm-section-hd">{t.postComment}</h3>
              <div className="rdm-composer-fields">
                <textarea
                  className="rdm-composer-text"
                  placeholder={t.commentPlaceholder}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleComment(); }}
                />
                <div className="rdm-composer-foot">
                  <button
                    className="rdm-post-btn"
                    onClick={handleComment}
                    disabled={!commentText.trim() || commentPosting}
                  >
                    {commentPosting ? t.postingLabel : "Post →"}
                  </button>
                </div>
                {commentError && <p className="rdm-err">{commentError}</p>}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
