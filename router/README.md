## Router
- it is the router of magnetar project
- its roles are : 
    - takes an incoming request from any user on the route `/`
    - forwards it to worker taken from a list of avalible workers 
        - for now its kind of low budget you have to manually go to config/workers.json and copy the urls the []string and paste it in constants.ts file 
        - i know its a stretch but bear with me
    - it forwards the request back to the user who requested it
    - if the server responds with 50X i.e fails we publish that detail to kafka using ngrok interface to kafka http bridge
    - then we use fire and forget to publish it to postgres as well
Router url : https://magnetar-router.chiefsarvagya.workers.dev