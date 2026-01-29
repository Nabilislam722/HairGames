**Connect to DataBase You have to open the Terminal and type this first**

Step - 1:
```
ssh -L 27017:127.0.0.1:27017 root@72.62.235.143
```
Then Type the password of the VPS (DON'T SHARE WITH ANYONE)
This Creates a SSH connection with the VPS on your local computer port 27017


Step - 2:

```
mongodb://localhost:27017/
```
-----------------------------------------------------------------------------------------

**From Here You will see all the commands we need**

```
sudo systemctl status
```
To check currently running servies


***Adding more Application on the same VPS (routing with nginx)***
```
sudo nano /etc/nginx/sites-available/default
```

Step 3 - Test and restart nginx
Test and restart nginx using following commands

```sudo nginx -t```
Now restart using:

```sudo systemctl restart nginx```