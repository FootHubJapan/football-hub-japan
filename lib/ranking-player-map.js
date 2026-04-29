/**
 * 生の選手配列（DB / players.json 同一形状）をランキングAPI用の行オブジェクトに変換する。
 * pickPlayerStatsForRanking は index.js 側の合算ロジックを注入（循環参照回避）。
 */
function mapRawPlayersToRankingRows(playerList, league, apiSeasonYear, seasonPatterns, pickFn) {
    const spanishTeams = [
        'real madrid', 'barcelona', 'atletico madrid', 'atlético madrid', 'real sociedad',
        'sevilla', 'valencia', 'athletic bilbao', 'osasuna', 'villarreal',
        'celta vigo', 'real betis', 'getafe', 'levante', 'granada',
        'alaves', 'rayo vallecano', 'mallorca', 'girona', 'cadiz',
        'las palmas', 'espanyol', 'almeria', 'valladolid', 'elche',
        'real madrid cf', 'fc barcelona', 'atletico de madrid', 'real sociedad de futbol',
        'sevilla fc', 'valencia cf', 'athletic club', 'ca osasuna', 'villarreal cf',
        'rc celta de vigo', 'real betis balompie', 'getafe cf', 'levante ud',
        'granada cf', 'deportivo alaves', 'rayo vallecano', 'rcd mallorca',
        'girona fc', 'cadiz cf', 'ud las palmas', 'rcd espanyol',
        'ud almeria', 'real valladolid', 'elche cf'
    ];
    const peruvianTeams = [
        'atletico grau', 'fbc melgar', 'atlético grau', 'melgar',
        'universitario', 'alianza lima', 'sporting cristal', 'césar vallejo',
        'carlos manucci', 'deportivo municipal', 'sport boys', 'cienciano',
        'ayacucho', 'cantolao', 'carlos stein', 'deportivo binacional'
    ];

    const leagueMapFull = {
        'PL': ['premier league', 'プレミアリーグ', 'premier', 'prem'],
        'PD': ['la liga', 'ラ・リーガ', 'laliga', 'primera división'],
        'SA': ['serie a', 'セリエa', 'serie', 'seriea'],
        'BL1': ['bundesliga', 'ブンデスリーガ', 'bundes'],
        'FL1': ['ligue 1', 'リーグ・アン', 'ligue', 'ligue1'],
        'J1': ['j1 league', 'j1リーグ', 'j1', 'j league', 'jleague'],
        'J2': ['j2 league', 'j2リーグ', 'j2'],
        'CL': ['champions league', 'チャンピオンズリーグ', 'uefa champions league'],
        'EL': ['europa league', 'ヨーロッパリーグ', 'uefa europa league'],
        'ECL': ['conference league', 'カンファレンスリーグ', 'uefa conference league'],
        'UECL': ['conference league', 'カンファレンスリーグ', 'uefa conference league'],
        'MLS': ['major league soccer', 'mls', 'メジャーリーグサッカー'],
        'SPL': ['saudi pro league', 'サウジアラビアプロリーグ', 'saudi arabian professional league', 'roshn saudi league']
    };

    return playerList
        .map(player => {
            let playerStats = null;
            let matchedLeague = null;

            if (Array.isArray(player.stats) && player.stats.length > 0) {
                const friendlyKeywords = [
                    'friendly', 'friendlies', '親善', 'exhibition', 'test match',
                    'friendly clubs', 'friendlies clubs', 'club friendly'
                ];

                const seasonStats = player.stats.filter(stat => {
                    const statSeason = String(stat.season || stat.seasonName || '');
                    const matchesSeason = seasonPatterns.some(
                        pattern =>
                            statSeason.includes(pattern) ||
                            statSeason === String(apiSeasonYear) ||
                            statSeason === String(apiSeasonYear + 1)
                    );
                    if (!matchesSeason) return false;
                    const statLeague = String(stat.leagueName || stat.league || '').toLowerCase();
                    const isFriendly = friendlyKeywords.some(keyword =>
                        statLeague.includes(keyword.toLowerCase())
                    );
                    return !isFriendly;
                });

                if (seasonStats.length > 0) {
                    if (league) {
                        const leagueKeywords = leagueMapFull[league] || [league.toLowerCase()];
                        const leagueFilteredStats = seasonStats.filter(stat => {
                            const statLeague = String(stat.leagueName || stat.league || '').toLowerCase();
                            let matches = false;
                            if (league === 'PD') {
                                matches =
                                    statLeague === 'la liga' ||
                                    statLeague === 'laliga' ||
                                    statLeague.includes('la liga') ||
                                    statLeague.includes('primera división') ||
                                    (statLeague.includes('liga') &&
                                        !statLeague.includes('primeira') &&
                                        !statLeague.includes('mx') &&
                                        !statLeague.includes('profesional') &&
                                        !statLeague.includes('czech') &&
                                        !statLeague.includes('segunda') &&
                                        !statLeague.includes('bundes') &&
                                        !statLeague.includes('argentina') &&
                                        !statLeague.includes('portugal') &&
                                        !statLeague.includes('mexico') &&
                                        !statLeague.includes('superliga') &&
                                        !statLeague.includes('pro league') &&
                                        !statLeague.includes('major league'));
                                if (!matches && statLeague) {
                                    console.log(
                                        `⚠️ PDフィルタ: 除外されたリーグ: "${statLeague}" (選手: ${player.name || player.fullName})`
                                    );
                                }
                            } else {
                                matches = leagueKeywords.some(keyword =>
                                    statLeague.includes(keyword.toLowerCase())
                                );
                            }
                            return matches;
                        });

                        if (leagueFilteredStats.length > 0) {
                            playerStats = pickFn(leagueFilteredStats);
                            matchedLeague = String(playerStats.leagueName || playerStats.league || '').toLowerCase();

                            if (league === 'PD') {
                                const teamName = String(
                                    playerStats.teamName || player.currentTeam || player.team || ''
                                ).toLowerCase();
                                const isPeruvianTeam = peruvianTeams.some(pt => teamName.includes(pt));
                                const isSpanishTeam = spanishTeams.some(st => teamName.includes(st));

                                if (isPeruvianTeam) {
                                    console.log(
                                        `❌ PDフィルタ: ペルーのチームで除外: ${player.name || player.fullName} (チーム: "${teamName}")`
                                    );
                                    return null;
                                }
                                if (!isSpanishTeam && teamName) {
                                    const isLaLiga =
                                        matchedLeague === 'la liga' ||
                                        matchedLeague === 'laliga' ||
                                        matchedLeague.includes('la liga');
                                    if (!isLaLiga) {
                                        console.log(
                                            `❌ PDフィルタ: スペインのチームリストにないため除外: ${player.name || player.fullName} (チーム: "${teamName}", リーグ: "${matchedLeague}")`
                                        );
                                        return null;
                                    }
                                }
                                console.log(
                                    `✅ PDフィルタ: マッチした選手: ${player.name || player.fullName} (リーグ: "${matchedLeague}", チーム: "${teamName}")`
                                );
                            }
                        } else {
                            if (league === 'PD') {
                                console.log(`❌ PDフィルタ: リーグマッチなしで除外: ${player.name || player.fullName}`);
                            }
                            return null;
                        }
                    } else {
                        const nonFriendlyStats = seasonStats.filter(stat => {
                            const statLeague = String(stat.leagueName || stat.league || '').toLowerCase();
                            return !friendlyKeywords.some(keyword =>
                                statLeague.includes(keyword.toLowerCase())
                            );
                        });
                        if (nonFriendlyStats.length > 0) {
                            playerStats = pickFn(nonFriendlyStats);
                        } else {
                            playerStats = pickFn(seasonStats);
                        }
                        matchedLeague = String(playerStats.leagueName || playerStats.league || '').toLowerCase();
                    }
                } else {
                    if (league) {
                        return null;
                    }
                    const nonFriendlyStats = player.stats.filter(stat => {
                        const statLeague = String(stat.leagueName || stat.league || '').toLowerCase();
                        return !friendlyKeywords.some(keyword => statLeague.includes(keyword.toLowerCase()));
                    });
                    if (nonFriendlyStats.length > 0) {
                        playerStats = pickFn(nonFriendlyStats);
                    } else {
                        playerStats = pickFn(player.stats);
                    }
                    matchedLeague = String(playerStats?.leagueName || playerStats?.league || '').toLowerCase();
                }
            } else if (player.stats && typeof player.stats === 'object' && !Array.isArray(player.stats)) {
                const statSeason = String(player.stats.season || player.stats.seasonName || '');
                const matchesSeason = seasonPatterns.some(
                    pattern =>
                        statSeason.includes(pattern) ||
                        statSeason === String(apiSeasonYear) ||
                        statSeason === String(apiSeasonYear + 1)
                );
                const statLeague0 = String(player.stats.leagueName || player.stats.league || '').toLowerCase();
                const friendlyKeywords = [
                    'friendly', 'friendlies', '親善', 'exhibition', 'test match',
                    'friendly clubs', 'friendlies clubs', 'club friendly'
                ];
                const isFriendly = friendlyKeywords.some(keyword =>
                    statLeague0.includes(keyword.toLowerCase())
                );
                if (isFriendly) {
                    return null;
                }

                if (matchesSeason || !league) {
                    if (league) {
                        const statLeague = String(player.stats.leagueName || player.stats.league || '').toLowerCase();
                        let matchesLeague = false;
                        if (league === 'PD') {
                            matchesLeague =
                                statLeague === 'la liga' ||
                                statLeague === 'laliga' ||
                                statLeague.includes('la liga') ||
                                statLeague.includes('primera división') ||
                                (statLeague.includes('liga') &&
                                    !statLeague.includes('primeira') &&
                                    !statLeague.includes('mx') &&
                                    !statLeague.includes('profesional') &&
                                    !statLeague.includes('czech') &&
                                    !statLeague.includes('segunda') &&
                                    !statLeague.includes('bundes') &&
                                    !statLeague.includes('argentina') &&
                                    !statLeague.includes('portugal') &&
                                    !statLeague.includes('mexico') &&
                                    !statLeague.includes('superliga') &&
                                    !statLeague.includes('pro league') &&
                                    !statLeague.includes('major league'));
                        } else {
                            const leagueKeywords = leagueMapFull[league] || [league.toLowerCase()];
                            matchesLeague = leagueKeywords.some(keyword =>
                                statLeague.includes(keyword.toLowerCase())
                            );
                        }

                        if (matchesLeague) {
                            if (league === 'PD') {
                                const teamName = String(
                                    player.stats.teamName || player.currentTeam || player.team || ''
                                ).toLowerCase();
                                const isPeruvianTeam = peruvianTeams.some(pt => teamName.includes(pt));
                                const isSpanishTeam = spanishTeams.some(st => teamName.includes(st));
                                if (isPeruvianTeam) {
                                    console.log(
                                        `❌ PDフィルタ: ペルーのチームで除外: ${player.name || player.fullName} (チーム: "${teamName}")`
                                    );
                                    return null;
                                }
                                if (!isSpanishTeam && teamName) {
                                    const isLaLiga =
                                        statLeague === 'la liga' ||
                                        statLeague === 'laliga' ||
                                        statLeague.includes('la liga');
                                    if (!isLaLiga) {
                                        console.log(
                                            `❌ PDフィルタ: スペインのチームリストにないため除外: ${player.name || player.fullName} (チーム: "${teamName}", リーグ: "${statLeague}")`
                                        );
                                        return null;
                                    }
                                }
                            }
                            playerStats = player.stats;
                            matchedLeague = String(playerStats.leagueName || playerStats.league || '').toLowerCase();
                        } else {
                            if (league === 'PD') {
                                console.log(
                                    `❌ PDフィルタ: リーグ不一致で除外: ${player.name || player.fullName} (リーグ: "${statLeague}")`
                                );
                            }
                            return null;
                        }
                    } else {
                        playerStats = player.stats;
                        matchedLeague = String(playerStats.leagueName || playerStats.league || '').toLowerCase();
                    }
                } else if (league) {
                    return null;
                }
            }

            if (league) {
                if (!matchedLeague) {
                    if (league === 'PD') {
                        console.log(`❌ PDフィルタ: matchedLeague未設定で除外: ${player.name || player.fullName}`);
                    }
                    return null;
                }
                const matchedLeagueLower = String(matchedLeague).toLowerCase();
                let matches = false;

                if (league === 'PD') {
                    const leagueMatches =
                        matchedLeagueLower === 'la liga' ||
                        matchedLeagueLower === 'laliga' ||
                        matchedLeagueLower.includes('la liga') ||
                        matchedLeagueLower.includes('primera división') ||
                        (matchedLeagueLower.includes('liga') &&
                            !matchedLeagueLower.includes('primeira') &&
                            !matchedLeagueLower.includes('mx') &&
                            !matchedLeagueLower.includes('profesional') &&
                            !matchedLeagueLower.includes('czech') &&
                            !matchedLeagueLower.includes('segunda') &&
                            !matchedLeagueLower.includes('bundes') &&
                            !matchedLeagueLower.includes('argentina') &&
                            !matchedLeagueLower.includes('portugal') &&
                            !matchedLeagueLower.includes('mexico') &&
                            !matchedLeagueLower.includes('superliga') &&
                            !matchedLeagueLower.includes('pro league') &&
                            !matchedLeagueLower.includes('major league'));

                    if (leagueMatches) {
                        const teamName = String(
                            playerStats?.teamName || player.currentTeam || player.team || ''
                        ).toLowerCase();
                        const isPeruvianTeam = peruvianTeams.some(pt => teamName.includes(pt));
                        const isSpanishTeam = spanishTeams.some(st => teamName.includes(st));
                        if (isPeruvianTeam) {
                            if (league === 'PD') {
                                console.log(
                                    `❌ PDフィルタ: ペルーのチームで除外: ${player.name || player.fullName} (チーム: "${teamName}")`
                                );
                            }
                            matches = false;
                        } else if (isSpanishTeam) {
                            matches = true;
                        } else if (teamName) {
                            matches =
                                matchedLeagueLower === 'la liga' ||
                                matchedLeagueLower === 'laliga' ||
                                matchedLeagueLower.includes('la liga');
                            if (!matches && league === 'PD') {
                                console.log(
                                    `❌ PDフィルタ: スペインのチームリストにないため除外: ${player.name || player.fullName} (チーム: "${teamName}", リーグ: "${matchedLeagueLower}")`
                                );
                            }
                        } else {
                            matches = leagueMatches;
                        }
                    } else {
                        matches = false;
                    }
                } else {
                    const validLeagues = leagueMapFull[league] || [league.toLowerCase()];
                    matches = validLeagues.some(l => matchedLeagueLower.includes(l));
                }

                if (!matches) {
                    if (league === 'PD') {
                        console.log(
                            `❌ PDフィルタ: 最終確認で不一致、除外: ${player.name || player.fullName} (リーグ: "${matchedLeagueLower}")`
                        );
                    }
                    return null;
                }
            }

            const goals = playerStats?.goals || 0;
            const assists = playerStats?.assists || 0;

            return {
                id: player.id,
                name: player.name || player.fullName,
                age: player.age,
                nationality: player.nationality,
                photo: player.photo || player.photoUrl,
                team: playerStats?.teamName || player.currentTeam || player.team,
                currentTeam: playerStats?.teamName || player.currentTeam || player.team,
                position: player.detailedPosition || player.position,
                detailedPosition: player.detailedPosition || player.position,
                league: matchedLeague || player.league || player.leagueName,
                goals,
                assists,
                goalsAssists: goals + assists,
                appearances: playerStats?.appearances || playerStats?.lineups || 0,
                minutes: playerStats?.minutes || 0,
                rating: playerStats?.rating || 'N/A',
                passes: playerStats?.passesTotal || 0,
                passAccuracy: playerStats?.passAccuracy || '0%',
                tackles: playerStats?.tackles || 0,
                interceptions: playerStats?.interceptions || 0,
                saves: playerStats?.saves || 0,
                cleanSheets: playerStats?.cleanSheets || 0,
                yellowCards: playerStats?.yellowCards || 0,
                redCards: playerStats?.redCards || 0,
                shots: playerStats?.shotsTotal || 0,
                shotsOnTarget: playerStats?.shotsOnTarget || 0
            };
        })
        .filter(p => p !== null);
}

/**
 * API-Football 直取得分など、stats レベル以外の粗いリーグ文字列を最終調整し、検索・ポジション・ソートを適用。
 */
function processRankingPlayerList(players, league, position, stat, search) {
    let list = Array.isArray(players) ? [...players] : [];

    if (list.length > 0) {
        const leagueMapping = {
            PL: ['premier league', 'プレミアリーグ', 'premier', 'prem'],
            PD: ['la liga', 'ラ・リーガ', 'laliga', 'primera división'],
            SA: ['serie a', 'セリエa', 'serie', 'seriea'],
            BL1: ['bundesliga', 'ブンデスリーガ', 'bundes'],
            FL1: ['ligue 1', 'リーグ・アン', 'ligue', 'ligue1'],
            J1: ['j1 league', 'j1リーグ', 'j1', 'j league', 'jleague'],
            J2: ['j2 league', 'j2リーグ', 'j2', 'j2 league'],
            CL: ['champions league', 'チャンピオンズリーグ', 'uefa champions league'],
            EL: ['europa league', 'ヨーロッパリーグ', 'uefa europa league'],
            ECL: ['conference league', 'カンファレンスリーグ', 'uefa conference league'],
            UECL: ['conference league', 'カンファレンスリーグ', 'uefa conference league'],
            MLS: ['major league soccer', 'mls', 'メジャーリーグサッカー'],
            SPL: ['saudi pro league', 'サウジアラビアプロリーグ', 'saudi arabian professional league', 'roshn saudi league']
        };

        const beforeFilter = list.length;

        if (league === 'PD') {
            console.log(`🔍 PDフィルタリング前: ${beforeFilter}名の選手`);
            console.log(
                `📊 サンプルリーグ情報:`,
                list.slice(0, 10).map(p => p.league).filter(Boolean)
            );
        }

        list = list.filter(p => {
            const playerLeague = String(p.league || '').toLowerCase();
            if (!playerLeague) {
                if (!league) {
                    return true;
                }
                if (league === 'PD') {
                    console.log(`⚠️ PDフィルタ: リーグ情報なしで除外: ${p.name || p.fullName}`);
                }
                return false;
            }

            let matches = false;
            if (league) {
                if (league === 'PD') {
                    matches =
                        playerLeague === 'la liga' ||
                        playerLeague === 'laliga' ||
                        playerLeague.includes('la liga') ||
                        playerLeague.includes('primera división') ||
                        (playerLeague.includes('liga') &&
                            !playerLeague.includes('primeira') &&
                            !playerLeague.includes('mx') &&
                            !playerLeague.includes('profesional') &&
                            !playerLeague.includes('czech') &&
                            !playerLeague.includes('segunda') &&
                            !playerLeague.includes('bundes') &&
                            !playerLeague.includes('argentina'));
                } else {
                    const validLeagues = leagueMapping[league] || [league.toLowerCase()];
                    matches = validLeagues.some(l => playerLeague.includes(l));
                }
            } else {
                matches = true;
            }

            if (league === 'PD' && !matches) {
                console.log(`⚠️ PDフィルタ: 除外された選手: ${p.name || p.fullName} (リーグ: "${playerLeague}")`);
            }
            return matches;
        });
        console.log(
            `✅ Final league filter: ${beforeFilter} → ${list.length} players${
                league ? ` in league: ${league}` : ''
            }`
        );
    }

    if (search && search.trim() && list.length > 0) {
        const beforeFilter = list.length;
        const searchLower = search.trim().toLowerCase();
        list = list.filter(p => {
            const name = (p.name || p.fullName || '').toLowerCase();
            const team = (p.currentTeam || p.team || '').toLowerCase();
            const pLeague = (p.league || '').toLowerCase();
            const nationality = (p.nationality || '').toLowerCase();
            return (
                name.includes(searchLower) ||
                team.includes(searchLower) ||
                pLeague.includes(searchLower) ||
                nationality.includes(searchLower)
            );
        });
        console.log(`✅ Search filter: ${beforeFilter} → ${list.length} players matching "${search}"`);
    }

    if (position && list.length > 0) {
        const beforeFilter = list.length;
        list = list.filter(
            p => p.position && p.position.toLowerCase().includes(position.toLowerCase())
        );
        console.log(`✅ Position filter: ${beforeFilter} → ${list.length} players in position: ${position}`);
    }

    if (stat && list.length > 0) {
        list.sort((a, b) => {
            let aValue;
            let bValue;
            if (stat === 'goalsAssists') {
                const aGoals =
                    typeof a.goals === 'string' ? parseFloat(a.goals) || 0 : a.goals || 0;
                const aAssists =
                    typeof a.assists === 'string' ? parseFloat(a.assists) || 0 : a.assists || 0;
                const aStatsGoals =
                    typeof a.stats?.goals === 'string' ? parseFloat(a.stats.goals) || 0 : a.stats?.goals || 0;
                const aStatsAssists =
                    typeof a.stats?.assists === 'string'
                        ? parseFloat(a.stats.assists) || 0
                        : a.stats?.assists || 0;
                aValue = (aGoals || aStatsGoals) + (aAssists || aStatsAssists);
                const bGoals =
                    typeof b.goals === 'string' ? parseFloat(b.goals) || 0 : b.goals || 0;
                const bAssists =
                    typeof b.assists === 'string' ? parseFloat(b.assists) || 0 : b.assists || 0;
                const bStatsGoals =
                    typeof b.stats?.goals === 'string' ? parseFloat(b.stats.goals) || 0 : b.stats?.goals || 0;
                const bStatsAssists =
                    typeof b.stats?.assists === 'string'
                        ? parseFloat(b.stats.assists) || 0
                        : b.stats?.assists || 0;
                bValue = (bGoals || bStatsGoals) + (bAssists || bStatsAssists);
            } else {
                aValue = typeof a[stat] === 'string' ? parseFloat(a[stat]) || 0 : a[stat] || 0;
                bValue = typeof b[stat] === 'string' ? parseFloat(b[stat]) || 0 : b[stat] || 0;
            }
            return bValue - aValue;
        });
        console.log(`✅ Sorted ${list.length} players by ${stat}`);
    }

    return list;
}

module.exports = {
    mapRawPlayersToRankingRows,
    processRankingPlayerList
};
