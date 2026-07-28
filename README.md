 Start frontend and backend with npm
                                                                                  
Terminal 1 — Backend:
cd carbonhealth/apps/api                                                        
uvicorn app.main:app --reload --port 8000                                    
                                                                                  
Terminal 2 — Frontend:                                                          
cd carbonhealth/apps/web
npm run dev                                                                     
                                                                               
Or both together from root:                                                  
cd carbonhealth                                                                 
npm run dev:all