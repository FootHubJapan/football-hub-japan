#!/usr/bin/env node

require('dotenv').config();

const API_KEY = process.env.API_FOOTBALL_KEY;

async function testKubo() {
    console.log('Testing Kubo search...');
    
    const majorLeagues = [39, 140, 135, 78, 61, 98, 88, 94];
    const searchNames = ['久保建英', 'Kubo', 'Takefusa Kubo', 'T. Kubo'];
    
    for (const leagueId of majorLeagues) {
        for (const searchName of searchNames) {
            try {
                console.log(`Testing: ${searchName} in league ${leagueId}`);
                
                const response = await fetch(
                    `https://v3.football.api-sports.io/players?search=${encodeURIComponent(searchName)}&league=${leagueId}&season=2024`,
                    {
                        headers: {
                            'x-apisports-key': API_KEY
                        }
                    }
                );
                
                if (response.ok) {
                    const data = await response.json();
                    console.log(`  Results: ${data.results}`);
                    if (data.results > 0) {
                        console.log(`  Player: ${data.response[0].player.name}`);
                        console.log(`  Team: ${data.response[0].statistics[0].team.name}`);
                        return;
                    }
                } else {
                    console.log(`  Error: ${response.status}`);
                }
                
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
                console.log(`  Exception: ${error.message}`);
            }
        }
    }
}

testKubo().catch(console.error);
