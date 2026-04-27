/**
 * 2025/26 選手スタッツ（全ページ共通）— lib/player-stats-consistency と選手詳細の合計行と同じ合算
 */
(function (w) {
    var FHJ_CURRENT_SEASON_KEY = '2025-2026';

    function fhjIsSeason2025_26(raw) {
        if (raw == null || raw === '') return false;
        var s = String(raw).trim();
        if (s === '2025' || s === '2025/26' || s === '2025/2026' || s === '2025-2026') return true;
        if (/2025.*2026/.test(s)) return true;
        if (/^2025\//.test(s)) return true;
        return false;
    }

    function fhjDedupeCompetitionStats(statsArray) {
        if (!Array.isArray(statsArray) || statsArray.length === 0) return [];
        var byKey = new Map();
        for (var i = 0; i < statsArray.length; i++) {
            var st = statsArray[i];
            if (!st) continue;
            var league = String(st.leagueName || st.league || '')
                .toLowerCase()
                .trim();
            var season = String(st.season || '');
            var key = season + '::' + league + '::' + String(st.teamName || st.team || '');
            var apps = Number(st.appearances || st.matches || st.lineups || 0);
            var prev = byKey.get(key);
            if (!prev) {
                byKey.set(key, st);
                continue;
            }
            var prevApps = Number(prev.appearances || prev.matches || prev.lineups || 0);
            var prevTs = prev.lastUpdated ? new Date(prev.lastUpdated).getTime() : 0;
            var curTs = st.lastUpdated ? new Date(st.lastUpdated).getTime() : 0;
            if (apps > prevApps || (apps === prevApps && curTs >= prevTs)) {
                byKey.set(key, st);
            }
        }
        return Array.from(byKey.values());
    }

    function fhjBuildSeason2526FromStatsArray(statsArray) {
        if (!Array.isArray(statsArray)) return null;
        var seasonRows = statsArray.filter(function (s) {
            return s && fhjIsSeason2025_26(s.season);
        });
        if (seasonRows.length === 0) return null;
        var deduped = fhjDedupeCompetitionStats(seasonRows);
        var goals = 0;
        var assists = 0;
        var appearances = 0;
        var minutes = 0;
        var ratingWeighted = 0;
        var ratingW = 0;
        for (var j = 0; j < deduped.length; j++) {
            var st = deduped[j];
            goals += Number(st.goals || 0);
            assists += Number(st.assists || 0);
            var aps = Number(st.appearances || st.matches || st.lineups || 0);
            appearances += aps;
            minutes += Number(st.minutes || 0);
            var r =
                st.rating != null && st.rating !== 'N/A'
                    ? parseFloat(String(st.rating).replace(',', '.'))
                    : null;
            if (r != null && !isNaN(r) && aps > 0) {
                ratingWeighted += r * aps;
                ratingW += aps;
            }
        }
        var rating = ratingW > 0 ? Math.round((ratingWeighted / ratingW) * 100) / 100 : null;
        return {
            goals: goals,
            assists: assists,
            appearances: appearances,
            minutes: minutes,
            rating: rating != null ? String(rating) : 'N/A',
        };
    }

    function fhjListSeason2025_26Stats(player) {
        if (!player) {
            return { goals: 0, assists: 0, appearances: 0, minutes: 0, rating: 'N/A' };
        }
        if (Array.isArray(player.stats) && player.stats.length) {
            var a = fhjBuildSeason2526FromStatsArray(player.stats);
            if (a) return a;
        }
        if (player.stats && typeof player.stats === 'object' && !Array.isArray(player.stats)) {
            var s = player.stats;
            if (fhjIsSeason2025_26(s.season || player.season)) {
                var ap = Number(s.appearances || s.matches || s.lineups || 0);
                return {
                    goals: Number(s.goals || 0),
                    assists: Number(s.assists || 0),
                    appearances: ap,
                    minutes: Number(s.minutes || 0),
                    rating: s.rating != null ? String(s.rating) : 'N/A',
                };
            }
        }
        if (
            player.seasons &&
            player.seasons[FHJ_CURRENT_SEASON_KEY] &&
            player.seasons[FHJ_CURRENT_SEASON_KEY].stats
        ) {
            return player.seasons[FHJ_CURRENT_SEASON_KEY].stats;
        }
        return { goals: 0, assists: 0, appearances: 0, minutes: 0, rating: 'N/A' };
    }

    w.FHJ_CURRENT_SEASON_KEY = FHJ_CURRENT_SEASON_KEY;
    w.fhjListSeason2025_26Stats = fhjListSeason2025_26Stats;
})(typeof window !== 'undefined' ? window : this);
