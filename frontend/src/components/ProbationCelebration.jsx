// ProbationCelebration.jsx - Celebration component for probation completion
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, Box, Typography, Button } from '@mui/material';
import Confetti from 'react-confetti';
import '../styles/ProbationCelebration.css';

const ProbationCelebration = ({ open, onClose }) => {
    const [showConfetti, setShowConfetti] = useState(true);
    const [windowSize, setWindowSize] = useState({
        width: window.innerWidth,
        height: window.innerHeight
    });

    useEffect(() => {
        const handleResize = () => {
            setWindowSize({
                width: window.innerWidth,
                height: window.innerHeight
            });
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (open) {
            setShowConfetti(true);
            // Stop confetti after 5 seconds
            const timer = setTimeout(() => {
                setShowConfetti(false);
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [open]);

    return (
        <>
            {showConfetti && open && (
                <Confetti
                    width={windowSize.width}
                    height={windowSize.height}
                    recycle={false}
                    numberOfPieces={500}
                    gravity={0.3}
                />
            )}
            <Dialog
                open={open}
                onClose={onClose}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                    sx: {
                        borderRadius: '24px',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        position: 'relative',
                        overflow: 'hidden'
                    }
                }}
            >
                <DialogContent sx={{ p: 4, textAlign: 'center', position: 'relative', zIndex: 1 }}>
                    <Box className="celebration-container">
                        {/* Animated Emoji */}
                        <Box className="celebration-emoji">
                            <span className="emoji-large">🎉</span>
                            <span className="emoji-medium">🎊</span>
                            <span className="emoji-small">✨</span>
                        </Box>

                        {/* Main Message */}
                        <Typography
                            variant="h3"
                            sx={{
                                fontWeight: 'bold',
                                color: '#fff',
                                mb: 2,
                                textShadow: '2px 2px 4px rgba(0,0,0,0.3)',
                                animation: 'pulse 2s ease-in-out infinite'
                            }}
                        >
                            Congratulations!
                        </Typography>

                        <Typography
                            variant="h5"
                            sx={{
                                color: '#fff',
                                mb: 3,
                                fontWeight: 500,
                                textShadow: '1px 1px 2px rgba(0,0,0,0.3)'
                            }}
                        >
                            You have successfully completed your probation period!
                        </Typography>

                        <Typography
                            variant="body1"
                            sx={{
                                color: 'rgba(255,255,255,0.9)',
                                mb: 4,
                                lineHeight: 1.6
                            }}
                        >
                            Your dedication and hard work have been recognized.
                            <br />
                            Welcome to the team as a permanent employee! 🎊
                        </Typography>

                        <Button
                            variant="contained"
                            onClick={onClose}
                            sx={{
                                bgcolor: '#fff',
                                color: '#667eea',
                                fontWeight: 'bold',
                                px: 4,
                                py: 1.5,
                                borderRadius: '12px',
                                '&:hover': {
                                    bgcolor: '#f5f5f5',
                                    transform: 'scale(1.05)'
                                },
                                transition: 'all 0.3s ease'
                            }}
                        >
                            Continue
                        </Button>
                    </Box>
                </DialogContent>

                {/* Decorative Elements */}
                <Box className="celebration-sparkles">
                    {[...Array(20)].map((_, i) => (
                        <span key={i} className="sparkle" style={{
                            left: `${Math.random() * 100}%`,
                            top: `${Math.random() * 100}%`,
                            animationDelay: `${Math.random() * 2}s`
                        }}>✨</span>
                    ))}
                </Box>
            </Dialog>
        </>
    );
};

export default ProbationCelebration;

























