import { useState } from 'react';
import api from '../../api/axios';

const AnonymousFeedback = () => {
    const [message, setMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [notification, setNotification] = useState(null);

    const handleSubmit = async () => {
        if (!message.trim()) {
            setNotification({ type: 'warning', text: 'Please enter a message' });
            setTimeout(() => setNotification(null), 3000);
            return;
        }

        setSubmitting(true);
        try {
            await api.post('/policies/anonymous-feedback', { message });
            setNotification({ type: 'success', text: 'Feedback submitted anonymously' });
            setMessage('');
            setTimeout(() => setNotification(null), 3000);
        } catch (error) {
            console.error('Failed to submit feedback:', error);
            setNotification({ type: 'error', text: 'Failed to submit feedback' });
            setTimeout(() => setNotification(null), 3000);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="anonymous-feedback">
            <p className="feedback-helper">
                Your identity will not be recorded. Share your feedback freely.
            </p>
            
            <textarea
                className="feedback-textarea"
                placeholder="Write your feedback here. Your identity will not be recorded."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
            />
            
            <button
                className="feedback-submit"
                onClick={handleSubmit}
                disabled={submitting || !message.trim()}
            >
                {submitting ? 'Submitting...' : 'Submit Anonymously →'}
            </button>

            {notification && (
                <div className={`feedback-notification feedback-notification-${notification.type}`}>
                    {notification.text}
                </div>
            )}
        </div>
    );
};

export default AnonymousFeedback;
