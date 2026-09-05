// frontend/src/components/PageHeroHeader.jsx

import React from 'react';
import PropTypes from 'prop-types';
import { Box, Typography } from '@mui/material';
import '../styles/PageHeroHeader.css';

const PageHeroHeader = ({
  eyebrow = null,
  title,
  description = null,
  icon = null,
  actionArea = null,
  stats = null,
  children = null,
  align = 'between',
}) => {
  return (
    <header className={`page-hero-header ${align === 'center' ? 'page-hero-header--center' : ''}`}>
      <Box className="page-hero-header__content">
        {eyebrow && (
          <Typography
            variant="overline"
            className="page-hero-header__eyebrow"
            component="p"
          >
            {eyebrow}
          </Typography>
        )}

        <Box className="page-hero-header__title-row">
          {icon && <span className="page-hero-header__icon">{icon}</span>}
          <Typography variant="h4" component="h1" className="page-hero-header__title">
            {title}
          </Typography>
        </Box>

        {description && (
          <Typography variant="body1" className="page-hero-header__description">
            {description}
          </Typography>
        )}

        {children}

        {Array.isArray(stats) && stats.length > 0 && (
          <Box className="page-hero-header__stats">
            {stats.map(({ label, value, helper }) => (
              <div key={label} className="page-hero-header__stat">
                <span className="page-hero-header__stat-value">{value}</span>
                <span className="page-hero-header__stat-label">{label}</span>
                {helper && <span className="page-hero-header__stat-helper">{helper}</span>}
              </div>
            ))}
          </Box>
        )}
      </Box>

      {actionArea && (
        <Box className="page-hero-header__actions">
          {actionArea}
        </Box>
      )}
    </header>
  );
};

PageHeroHeader.propTypes = {
  eyebrow: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  title: PropTypes.oneOfType([PropTypes.string, PropTypes.node]).isRequired,
  description: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  icon: PropTypes.node,
  actionArea: PropTypes.node,
  stats: PropTypes.arrayOf(PropTypes.shape({
    label: PropTypes.string.isRequired,
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    helper: PropTypes.oneOfType([PropTypes.string, PropTypes.node])
  })),
  children: PropTypes.node,
  align: PropTypes.oneOf(['between', 'center'])
};

export default PageHeroHeader;

