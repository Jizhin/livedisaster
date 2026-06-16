import { Send } from "lucide-react";
import { useState } from "react";
import { api } from "../api/client";
import type { Comment } from "../types";
import { timeAgo } from "../utils/time";

export function CommentSection({
  comments,
  reportId,
  onCommentAdded,
}: {
  comments: Comment[];
  reportId: number;
  onCommentAdded?: (comments: Comment[]) => void;
}) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handlePost = async () => {
    if (!text.trim() || !name.trim() || submitting) return;
    setSubmitting(true);
    try {
      const updated = await api.addComment(reportId, {
        author_name: name.trim(),
        content: text.trim(),
      });
      setName("");
      setText("");
      if (onCommentAdded && updated.comments) onCommentAdded(updated.comments);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="comments">
      <div className="modal-section-heading">
        <h3>Community Updates (Comments)</h3>
        <select aria-label="Comment sort"><option>Newest first</option></select>
      </div>
      {comments.map((comment) => (
        <article key={comment.id} className="comment">
          <strong>{comment.author_name}</strong>
          <span>{timeAgo(comment.created_at)}</span>
          <p>{comment.content}</p>
        </article>
      ))}
      <form
        className="comment-form"
        onSubmit={(e) => { e.preventDefault(); handlePost(); }}
      >
        <input
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          placeholder="Add a comment…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" disabled={submitting}>
          <Send size={16} />Post
        </button>
      </form>
    </section>
  );
}
