##html
<body>
  
  <div id="circle-orbit-container">
    <div class="sun">
    </div>

  </div>
</body>


##css
  body{
background-color: black;
  display: flex;
  justify-content: center;
  align-items: center;
height: 500px;
}
.sun{
  align-items: center;
  justify-content: center;
  position: absolute;
  display: flex;
  height: 100px;
  width: 100px;
  border-radius: 50%;
  background: url('https://cdn.pixabay.com/photo/2012/01/09/09/10/sun-11582_960_720.jpg');
  background-position: center center;
  box-shadow: 1px 1px 30px 5px #fc9328;
  animation : pole-rotate 30s linear infinite;
}
@keyframes pole-rotate {
    0% {
        background-position: center center;
    }
    50% {
        background-position: 50% 40%;
    }
    to {
        transform: rotate(360deg);
        background-position: center center;
    }
}

