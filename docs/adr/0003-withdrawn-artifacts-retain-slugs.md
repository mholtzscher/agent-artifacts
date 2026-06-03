# Withdrawn artifacts retain their slugs

Deleting an artifact withdraws its public source and rendered access rather than hard-deleting its identity or metadata. Public artifact lists still include full withdrawn artifact metadata, while requests for a withdrawn artifact's source or rendered slug return `410 Gone`; this preserves link history and prevents silent slug reuse while making the artifact content unavailable.
